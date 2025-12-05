import { db } from "./db";
import { documents, codeRepositories, documentEmbeddings, documentSearchResults } from "@shared/schema";
import { eq, desc, like, and, sql } from "drizzle-orm";
import type { Document, InsertDocument, CodeRepository, InsertCodeRepository, DocumentEmbedding, InsertDocumentEmbedding, DocumentSearchResult, InsertDocumentSearchResult } from "@shared/schema";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface DocumentSearchMatch {
  document: Document;
  relevanceScore: number;
  matchedContent: string;
  type: string;
}

export interface RAGResponse {
  internalMatches: DocumentSearchMatch[];
  codeMatches: DocumentSearchMatch[];
  hasInternalContent: boolean;
  searchQuery: string;
  totalMatches: number;
}

export class DocumentService {
  // Create embeddings for document content
  async createEmbedding(text: string): Promise<number[] | null> {
    try {
      const response = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: text,
        encoding_format: "float",
      });
      return response.data[0].embedding;
    } catch (error) {
      console.error('Error creating embedding:', error);
      
      // If OpenAI is unavailable (quota exceeded, etc.), return null
      // This allows the sync to continue without embeddings
      if (error instanceof Error && (error.message.includes('quota') || error.message.includes('429'))) {
        console.warn('OpenAI quota exceeded, skipping embedding generation');
        return null;
      }
      
      // Throw the error so it can be caught by the text-based search fallback
      throw error;
    }
  }

  // Calculate cosine similarity between two embeddings
  private cosineSimilarity(a: number[], b: number[]): number {
    const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
    const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
    const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
    return dotProduct / (magnitudeA * magnitudeB);
  }

  // Add document to the knowledge base
  async addDocument(documentData: InsertDocument): Promise<Document> {
    const [document] = await db
      .insert(documents)
      .values({
        ...documentData,
        lastUpdated: new Date(),
      })
      .returning();
    
    // Create embeddings for document content (non-blocking)
    try {
      await this.createDocumentEmbeddings(document);
    } catch (error) {
      console.warn(`Failed to create embeddings for document ${document.id}, document will be available without semantic search capabilities:`, error);
      // Continue without embeddings - the document is still searchable via text-based search
    }
    
    return document;
  }

  // Create embeddings for document content (chunked)
  private async createDocumentEmbeddings(document: Document): Promise<void> {
    const chunkSize = 1000; // Characters per chunk
    const chunks = this.chunkTextWithLineNumbers(document.content, chunkSize);
    
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      try {
        const embedding = await this.createEmbedding(chunk.text);
        
        // Only create database record if embedding was successful
        if (embedding) {
          await db.insert(documentEmbeddings).values({
            documentId: document.id,
            chunkIndex: i,
            content: chunk.text,
            embedding: JSON.stringify(embedding),
            metadata: {
              documentTitle: document.title,
              documentType: document.type,
              chunkLength: chunk.text.length,
              startLineNumber: chunk.startLineNumber,
              endLineNumber: chunk.endLineNumber,
            },
          });
        }
      } catch (error) {
        console.error(`Failed to create embedding for chunk ${i} of document ${document.id}:`, error);
        // Continue with other chunks even if one fails
      }
    }
  }

  // Chunk text into smaller pieces for embedding
  private chunkText(text: string, chunkSize: number): string[] {
    const chunks: string[] = [];
    let start = 0;
    
    while (start < text.length) {
      let end = start + chunkSize;
      
      // Try to break at word boundaries
      if (end < text.length) {
        const lastSpace = text.lastIndexOf(' ', end);
        if (lastSpace > start) {
          end = lastSpace;
        }
      }
      
      chunks.push(text.substring(start, end).trim());
      start = end + 1;
    }
    
    return chunks.filter(chunk => chunk.length > 0);
  }

  // Enhanced chunking with line number tracking
  private chunkTextWithLineNumbers(text: string, chunkSize: number): Array<{
    text: string;
    startLineNumber: number;
    endLineNumber: number;
  }> {
    const lines = text.split('\n');
    const chunks: Array<{
      text: string;
      startLineNumber: number;
      endLineNumber: number;
    }> = [];
    
    let currentChunk = '';
    let currentStartLine = 1;
    let currentLineNumber = 1;
    
    for (const line of lines) {
      const lineWithNewline = line + '\n';
      
      // Check if adding this line would exceed chunk size
      if (currentChunk.length + lineWithNewline.length > chunkSize && currentChunk.length > 0) {
        // Save current chunk
        chunks.push({
          text: currentChunk.trim(),
          startLineNumber: currentStartLine,
          endLineNumber: currentLineNumber - 1
        });
        
        // Start new chunk
        currentChunk = lineWithNewline;
        currentStartLine = currentLineNumber;
      } else {
        currentChunk += lineWithNewline;
      }
      
      currentLineNumber++;
    }
    
    // Add the last chunk if it has content
    if (currentChunk.trim().length > 0) {
      chunks.push({
        text: currentChunk.trim(),
        startLineNumber: currentStartLine,
        endLineNumber: currentLineNumber - 1
      });
    }
    
    return chunks;
  }

  // Search documents using semantic similarity
  async searchDocuments(query: string, incidentId?: number, limit: number = 10): Promise<RAGResponse> {
    console.log('🔍 Starting document search for:', query);
    
    try {
      // Try to create embedding for the search query, but continue without it if it fails
      let queryEmbedding = null;
      try {
        console.log('🔍 Attempting to create embedding for search query...');
        queryEmbedding = await this.createEmbedding(query);
        console.log('✅ Embedding created successfully');
      } catch (error) {
        console.log('⚠️ Embedding creation failed, falling back to text-based search');
        return await this.textBasedSearch(query, incidentId, limit);
      }
      
      // If we can't create embeddings, fall back to text-based search
      if (!queryEmbedding) {
        console.log('⚠️ No embedding available, falling back to text-based search');
        return await this.textBasedSearch(query, incidentId, limit);
      }
      
      // Get all document embeddings
      const embeddings = await db
        .select({
          id: documentEmbeddings.id,
          documentId: documentEmbeddings.documentId,
          content: documentEmbeddings.content,
          embedding: documentEmbeddings.embedding,
          metadata: documentEmbeddings.metadata,
          document: documents,
        })
        .from(documentEmbeddings)
        .innerJoin(documents, eq(documentEmbeddings.documentId, documents.id))
        .where(eq(documents.isActive, true));
      
      // Calculate similarity scores
      const matches: DocumentSearchMatch[] = [];
      
      for (const embedding of embeddings) {
        const docEmbedding = JSON.parse(embedding.embedding);
        const similarity = this.cosineSimilarity(queryEmbedding, docEmbedding);
        
        if (similarity > 0.7) { // Threshold for relevance
          // Create a document copy with embedded metadata (including line numbers)
          const documentWithEmbeddingMetadata = {
            ...embedding.document,
            metadata: {
              ...embedding.document.metadata,
              ...embedding.metadata, // Include line numbers from embedding
            }
          };
          
          matches.push({
            document: documentWithEmbeddingMetadata,
            relevanceScore: Math.round(similarity * 100),
            matchedContent: embedding.content,
            type: embedding.document.type,
          });
        }
      }
      
      // Sort by relevance score
      matches.sort((a, b) => b.relevanceScore - a.relevanceScore);
      
      // Separate internal docs from code repository docs
      const internalMatches = matches.filter(match => 
        ['API_DOC', 'TROUBLESHOOTING', 'RUNBOOK'].includes(match.type)
      ).slice(0, limit);
      
      const codeMatches = matches.filter(match => 
        ['README', 'CONFIG'].includes(match.type)
      ).slice(0, limit);
      
      // Record search results if incidentId is provided
      if (incidentId) {
        await this.recordSearchResults(incidentId, matches.slice(0, limit), query);
      }
      
      return {
        internalMatches,
        codeMatches,
        hasInternalContent: internalMatches.length > 0,
        searchQuery: query,
        totalMatches: matches.length,
      };
    } catch (error) {
      console.error('Error searching documents:', error);
      // Fall back to text-based search if embedding search fails
      return await this.textBasedSearch(query, incidentId, limit);
    }
  }

  // Fallback text-based search when embeddings are not available
  private async textBasedSearch(query: string, incidentId?: number, limit: number = 10): Promise<RAGResponse> {
    try {
      console.log('🔍 Performing text-based search for:', query);
      
      // Get all active documents
      const allDocuments = await db
        .select()
        .from(documents)
        .where(eq(documents.isActive, true));
      
      const matches: DocumentSearchMatch[] = [];
      const queryLower = query.toLowerCase();
      const queryWords = queryLower.split(' ').filter(word => word.length > 2);
      
      // Extract technology-specific terms for better matching
      const techTerms = [];
      if (queryLower.includes('spring')) techTerms.push('spring', 'springboot', '@controller', '@service', '@restcontroller');
      if (queryLower.includes('java')) techTerms.push('java', 'class', 'public', 'private', 'method');
      if (queryLower.includes('json')) techTerms.push('json', 'jackson', 'objectmapper', 'jsonparse');
      if (queryLower.includes('http')) techTerms.push('http', 'rest', 'api', 'endpoint');
      if (queryLower.includes('exception')) techTerms.push('exception', 'error', 'throw', 'catch');
      
      for (const document of allDocuments) {
        const contentLower = document.content.toLowerCase();
        const titleLower = document.title.toLowerCase();
        
        // Calculate relevance score based on keyword matching
        let score = 0;
        let matchedContent = '';
        
        // Check title matches (higher weight)
        for (const word of queryWords) {
          if (titleLower.includes(word)) {
            score += 20;
          }
        }
        
        // Give documentation files priority boost for technical queries
        if (document.type === 'documentation') {
          // Documentation should be prioritized for architectural guidance
          score += 50; // Base boost for documentation
          
          // Additional boost for exception-related queries
          if (queryLower.includes('exception') || queryLower.includes('error')) {
            score += 30;
          }
          
          // Boost for controller/service queries
          if (queryLower.includes('controller') || queryLower.includes('service')) {
            score += 30;
          }
        }
        
        // Check for technology-specific terms (higher weight for code files)
        if (document.type === 'code') {
          for (const term of techTerms) {
            const termCount = (contentLower.match(new RegExp(term, 'g')) || []).length;
            score += termCount * 15; // Higher weight for tech terms in code
          }
        }
        
        // Check content matches
        for (const word of queryWords) {
          const escapedWord = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const wordCount = (contentLower.match(new RegExp(escapedWord, 'g')) || []).length;
          score += wordCount * 10;
          
          if (wordCount > 0) {
            // Find a relevant snippet
            const wordIndex = contentLower.indexOf(word);
            const start = Math.max(0, wordIndex - 100);
            const end = Math.min(document.content.length, wordIndex + 200);
            matchedContent = document.content.substring(start, end);
          }
        }
        
        // Include documents with some relevance
        if (score > 0) {
          matches.push({
            document,
            relevanceScore: Math.min(100, score),
            matchedContent: matchedContent || document.content.substring(0, 200),
            type: document.type,
          });
        }
      }
      
      // Sort by relevance score
      matches.sort((a, b) => b.relevanceScore - a.relevanceScore);
      
      // Separate internal docs from code repository docs
      const internalMatches = matches.filter(match => 
        ['documentation', 'API_DOC', 'TROUBLESHOOTING', 'RUNBOOK'].includes(match.type)
      ).slice(0, limit);
      
      const codeMatches = matches.filter(match => 
        match.type === 'code' || ['README', 'CONFIG'].includes(match.type)
      ).slice(0, limit);
      
      // Record search results if incidentId is provided
      if (incidentId) {
        await this.recordSearchResults(incidentId, matches.slice(0, limit), query);
      }
      
      const totalMatches = matches.length;
      const hasInternalContent = internalMatches.length > 0 || codeMatches.length > 0;
      
      console.log(`📊 Text-based search results: ${totalMatches} total, ${internalMatches.length} internal, ${codeMatches.length} code`);
      
      return {
        internalMatches,
        codeMatches,
        hasInternalContent,
        searchQuery: query,
        totalMatches,
      };
      
    } catch (error) {
      console.error('Error in text-based search:', error);
      return {
        internalMatches: [],
        codeMatches: [],
        hasInternalContent: false,
        searchQuery: query,
        totalMatches: 0,
      };
    }
  }

  // Record search results for analytics
  private async recordSearchResults(incidentId: number, matches: DocumentSearchMatch[], query: string): Promise<void> {
    for (const match of matches) {
      await db.insert(documentSearchResults).values({
        incidentId,
        documentId: match.document.id,
        relevanceScore: match.relevanceScore,
        usedInSolution: false,
        searchQuery: query,
        searchedAt: new Date(),
      });
    }
  }

  // Get all documents
  async getDocuments(): Promise<Document[]> {
    return await db
      .select()
      .from(documents)
      .where(eq(documents.isActive, true))
      .orderBy(desc(documents.lastUpdated));
  }

  // Get document by ID
  async getDocument(id: number): Promise<Document | undefined> {
    const [document] = await db
      .select()
      .from(documents)
      .where(and(eq(documents.id, id), eq(documents.isActive, true)));
    
    return document;
  }

  // Update document
  async updateDocument(id: number, updates: Partial<Document>): Promise<Document | undefined> {
    const [document] = await db
      .update(documents)
      .set({
        ...updates,
        lastUpdated: new Date(),
      })
      .where(eq(documents.id, id))
      .returning();
    
    // Recreate embeddings if content changed
    if (updates.content && document) {
      await db.delete(documentEmbeddings).where(eq(documentEmbeddings.documentId, id));
      await this.createDocumentEmbeddings(document);
    }
    
    return document;
  }

  // Delete document
  async deleteDocument(id: number): Promise<void> {
    await db.update(documents).set({ isActive: false }).where(eq(documents.id, id));
    await db.delete(documentEmbeddings).where(eq(documentEmbeddings.documentId, id));
  }

  // Delete all documents associated with a repository
  async deleteRepositoryDocuments(repositoryId: number): Promise<void> {
    // Get repository information
    const [repository] = await db
      .select()
      .from(codeRepositories)
      .where(eq(codeRepositories.id, repositoryId))
      .limit(1);
    
    if (!repository) {
      throw new Error(`Repository with ID ${repositoryId} not found`);
    }

    // Find all documents associated with this repository
    const repositoryDocuments = await db
      .select()
      .from(documents)
      .where(eq(documents.repositoryUrl, repository.url));
    
    // Delete all related data in the correct order to avoid foreign key violations
    for (const document of repositoryDocuments) {
      // Delete document search results first (foreign key constraint)
      await db.delete(documentSearchResults).where(eq(documentSearchResults.documentId, document.id));
      
      // Delete embeddings
      await db.delete(documentEmbeddings).where(eq(documentEmbeddings.documentId, document.id));
    }
    
    // Delete the documents themselves
    await db.delete(documents).where(eq(documents.repositoryUrl, repository.url));
    
    console.log(`🗑️ Deleted ${repositoryDocuments.length} documents associated with repository: ${repository.name}`);
  }

  // Repository management
  async addRepository(repoData: InsertCodeRepository): Promise<CodeRepository> {
    const [repository] = await db
      .insert(codeRepositories)
      .values(repoData)
      .returning();
    
    return repository;
  }

  async getRepositories(): Promise<CodeRepository[]> {
    return await db
      .select()
      .from(codeRepositories)
      .where(eq(codeRepositories.isActive, true))
      .orderBy(desc(codeRepositories.lastSyncAt));
  }

  // Sync repository content with improved error handling
  async syncRepository(repositoryId: number): Promise<void> {
    try {
      // Get repository details
      const [repository] = await db
        .select()
        .from(codeRepositories)
        .where(eq(codeRepositories.id, repositoryId));
      
      if (!repository) {
        throw new Error('Repository not found');
      }

      console.log(`🔄 Syncing repository: ${repository.name} (${repository.url})`);
      
      // Check if GitHub token is available
      const githubToken = process.env.GITHUB_TOKEN;
      if (!githubToken) {
        await db
          .update(codeRepositories)
          .set({
            syncStatus: 'AUTH_ERROR' as any,
            errorMessage: 'GitHub token not configured. Please add a GitHub token to enable repository sync.',
            lastSyncAt: new Date()
          })
          .where(eq(codeRepositories.id, repositoryId));
        
        throw new Error('GitHub token not configured. Please add a GitHub token to enable repository sync.');
      }

      // Update sync status to in progress
      await db
        .update(codeRepositories)
        .set({
          syncStatus: 'SYNCING',
          lastSyncAt: new Date(),
          errorMessage: null
        })
        .where(eq(codeRepositories.id, repositoryId));
      
      // Extract GitHub repository info from URL - support various GitHub URL formats
      const urlMatch = repository.url.match(/github\.com\/([^\/]+)\/([^\/]+?)(?:\.git|\/)?$/);
      if (!urlMatch) {
        throw new Error(`Invalid GitHub repository URL format: ${repository.url}. Expected format: https://github.com/owner/repo`);
      }
      
      const [, owner, repo] = urlMatch;
      const branch = repository.branch || 'main';
      
      // Fetch repository contents from GitHub API
      const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents?ref=${branch}`;
      console.log(`📡 Fetching from GitHub API: ${apiUrl} (branch: ${branch})`);
      
      const headers: Record<string, string> = {
        'User-Agent': 'AI-Support-Dashboard/1.0',
        'Accept': 'application/vnd.github.v3+json',
        'Authorization': `token ${githubToken}`,
      };
      
      const response = await fetch(apiUrl, { headers });

      if (!response.ok) {
        // Provide more detailed error information
        const errorBody = await response.text();
        console.error(`GitHub API Error Details: ${response.status} ${response.statusText}`, errorBody);
        
        if (response.status === 404) {
          // Try checking if the repository exists with a different default branch
          const altBranch = branch === 'main' ? 'master' : 'main';
          const altApiUrl = `https://api.github.com/repos/${owner}/${repo}/contents?ref=${altBranch}`;
          
          try {
            const altResponse = await fetch(altApiUrl, { headers });
            if (altResponse.ok) {
              console.log(`✅ Repository found with branch: ${altBranch}`);
              // Update the repository with the correct branch
              await db
                .update(codeRepositories)
                .set({ branch: altBranch })
                .where(eq(codeRepositories.id, repository.id));
              
              // Continue with the alternative branch
              const altContents = await altResponse.json();
              console.log(`📦 Retrieved ${altContents.length} items from GitHub (branch: ${altBranch})`);
              await this.processRepositoryContents(altContents, repository, owner, repo, altBranch);
              
              const codeFiles = await db
                .select()
                .from(documents)
                .where(and(
                  eq(documents.type, 'code'),
                  eq(documents.repositoryUrl, repository.url)
                ));
              
              console.log(`💾 Stored ${codeFiles.length} code files for repository ${repository.name}`);
              
              await db
                .update(codeRepositories)
                .set({
                  lastSyncAt: new Date(),
                  syncStatus: 'completed',
                  errorMessage: null
                })
                .where(eq(codeRepositories.id, repository.id));
              
              return;
            }
          } catch (altError) {
            console.log(`Alternative branch ${altBranch} also failed`);
          }
          
          throw new Error(`Repository not found: ${owner}/${repo}. Please verify the repository exists and is accessible. Tried both 'main' and 'master' branches.`);
        } else if (response.status === 403) {
          throw new Error(`Access denied to repository: ${owner}/${repo}. Please check your GitHub token permissions.`);
        } else {
          throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
        }
      }

      const contents = await response.json();
      console.log(`📦 Retrieved ${contents.length} items from GitHub`);
      
      // Debug: Show what we got
      console.log(`Items: ${contents.map((item: any) => `${item.name} (${item.type})`).join(', ')}`);
      
      // Process repository contents recursively
      await this.processRepositoryContents(contents, repository, owner, repo, branch);
      
      // Check how many code files were actually stored
      const codeFiles = await db
        .select()
        .from(documents)
        .where(and(
          eq(documents.type, 'code'),
          eq(documents.repositoryUrl, repository.url)
        ));
      
      console.log(`💾 Stored ${codeFiles.length} code files for repository ${repository.name}`);
      
      // Mark sync as completed
      await db
        .update(codeRepositories)
        .set({
          syncStatus: 'COMPLETED',
        })
        .where(eq(codeRepositories.id, repositoryId));
        
      console.log(`✅ Repository sync completed: ${repository.name}`);
      
    } catch (error) {
      console.error('Repository sync failed:', error);
      
      // Determine error type and provide appropriate message
      let errorMessage = 'Unknown error occurred';
      let syncStatus = 'FAILED';
      
      if (error instanceof Error) {
        if (error.message.includes('401') || error.message.includes('Bad credentials')) {
          errorMessage = 'GitHub authentication failed. Please check your token permissions.';
          syncStatus = 'AUTH_ERROR';
        } else if (error.message.includes('403')) {
          errorMessage = 'Access denied. Token may lack repository permissions.';
          syncStatus = 'ACCESS_DENIED';
        } else if (error.message.includes('404')) {
          errorMessage = 'Repository not found. Please verify the URL is correct.';
          syncStatus = 'NOT_FOUND';
        } else if (error.message.includes('rate limit')) {
          errorMessage = 'GitHub API rate limit exceeded. Please try again later.';
          syncStatus = 'RATE_LIMITED';
        } else {
          errorMessage = error.message;
        }
      }
      
      // Mark sync as failed with appropriate status
      await db
        .update(codeRepositories)
        .set({
          syncStatus: syncStatus as any,
          errorMessage: errorMessage,
          lastSyncAt: new Date()
        })
        .where(eq(codeRepositories.id, repositoryId));
        
      throw new Error(errorMessage);
    }
  }

  private async processRepositoryContents(
    contents: any[], 
    repository: CodeRepository, 
    owner: string, 
    repo: string, 
    branch: string,
    currentPath: string = ''
  ): Promise<void> {
    console.log(`🔍 Processing ${contents.length} items at path: ${currentPath || 'root'}`);
    
    for (const item of contents) {
      if (item.type === 'file') {
        // Process code files and important configuration/documentation files
        const codeExtensions = ['.java', '.js', '.ts', '.py', '.cpp', '.c', '.cs', '.go', '.rs', '.kt', '.swift'];
        const configExtensions = ['.xml', '.yml', '.yaml', '.json', '.properties', '.config', '.conf'];
        const docExtensions = ['.md', '.txt', '.rst', '.adoc'];
        const importantFiles = ['Procfile', 'Dockerfile', 'docker-compose.yml', 'package.json', 'requirements.txt', 'build.gradle', 'CMakeLists.txt'];
        
        const isCodeFile = codeExtensions.some(ext => item.name.endsWith(ext));
        const isConfigFile = configExtensions.some(ext => item.name.endsWith(ext));
        const isDocFile = docExtensions.some(ext => item.name.endsWith(ext));
        const isImportantFile = importantFiles.some(name => item.name === name);
        
        const shouldProcess = isCodeFile || isConfigFile || isDocFile || isImportantFile;
        
        console.log(`📁 File: ${item.name} ${shouldProcess ? '(processing)' : '(skipping)'} - ${isCodeFile ? 'code' : isConfigFile ? 'config' : isDocFile ? 'doc' : isImportantFile ? 'important' : 'other'}`);
        
        if (shouldProcess) {
          console.log(`📥 Fetching file: ${item.name}`);
          await this.fetchAndStoreRepositoryFile(item, repository, owner, repo, branch, currentPath);
        }
      } else if (item.type === 'dir') {
        // Recursively process directories (limit depth to avoid excessive API calls)
        const depth = currentPath.split('/').filter(p => p.length > 0).length;
        console.log(`📂 Directory: ${item.name} (depth: ${depth})`);
        
        if (depth < 10) {
          console.log(`📥 Fetching directory: ${item.name}`);
          const dirResponse = await fetch(item.url, {
            headers: {
              'User-Agent': 'AI-Support-Dashboard/1.0',
              'Accept': 'application/vnd.github.v3+json',
              'Authorization': `token ${process.env.GITHUB_TOKEN}`,
            },
          });
          
          if (dirResponse.ok) {
            const dirContents = await dirResponse.json();
            await this.processRepositoryContents(
              dirContents, 
              repository, 
              owner, 
              repo, 
              branch, 
              currentPath + '/' + item.name
            );
          } else {
            console.warn(`⚠️ Failed to fetch directory ${item.name}: ${dirResponse.status}`);
          }
        } else {
          console.log(`⏭️ Skipping directory ${item.name} (depth limit reached)`);
        }
      }
    }
  }

  private async fetchAndStoreRepositoryFile(
    file: any, 
    repository: CodeRepository, 
    owner: string, 
    repo: string, 
    branch: string,
    currentPath: string
  ): Promise<void> {
    try {
      // Fetch file content
      const fileResponse = await fetch(file.url, {
        headers: {
          'User-Agent': 'AI-Support-Dashboard/1.0',
          'Accept': 'application/vnd.github.v3+json',
        },
      });
      
      if (!fileResponse.ok) {
        console.warn(`Failed to fetch file ${file.name}: ${fileResponse.status}`);
        return;
      }
      
      const fileData = await fileResponse.json();
      
      // Decode base64 content
      const content = Buffer.from(fileData.content, 'base64').toString('utf8');
      const fullPath = currentPath ? `${currentPath}/${file.name}` : file.name;
      
      // Check if document already exists
      const existingDoc = await db
        .select()
        .from(documents)
        .where(and(
          eq(documents.filePath, fullPath),
          eq(documents.repositoryUrl, repository.url),
          eq(documents.isActive, true)
        ))
        .limit(1);
      
      if (existingDoc.length > 0) {
        // Update existing document
        await db
          .update(documents)
          .set({
            content,
            lastUpdated: new Date(),
          })
          .where(eq(documents.id, existingDoc[0].id));
          
        console.log(`📝 Updated file: ${fullPath}`);
      } else {
        // Determine document type based on file extension/name
        const codeExtensions = ['.java', '.js', '.ts', '.py', '.cpp', '.c', '.cs', '.go', '.rs', '.kt', '.swift'];
        const configExtensions = ['.xml', '.yml', '.yaml', '.json', '.properties', '.config', '.conf'];
        const docExtensions = ['.md', '.txt', '.rst', '.adoc'];
        const importantFiles = ['Procfile', 'Dockerfile', 'docker-compose.yml', 'package.json', 'requirements.txt', 'build.gradle', 'CMakeLists.txt'];
        
        let documentType = 'code';
        if (codeExtensions.some(ext => file.name.endsWith(ext))) {
          documentType = 'code';
        } else if (configExtensions.some(ext => file.name.endsWith(ext))) {
          documentType = 'CONFIG';
        } else if (docExtensions.some(ext => file.name.endsWith(ext))) {
          documentType = 'documentation';
        } else if (importantFiles.some(name => file.name === name)) {
          documentType = 'CONFIG';
        }
        
        // Create new document
        const documentData = {
          title: file.name,
          content,
          type: documentType as const,
          filePath: fullPath,
          repositoryUrl: repository.url,
          branch: repository.branch || 'main',
          lastUpdated: new Date(),
          metadata: {
            repository: repository.name,
            owner,
            repo,
            sha: fileData.sha,
          },
          isActive: true,
        };
        
        const [document] = await db
          .insert(documents)
          .values(documentData)
          .returning();
        
        // Create embeddings for the new document
        await this.createDocumentEmbeddings(document);
        
        console.log(`💾 Stored ${documentType} file: ${fullPath}`);
      }
      
    } catch (error) {
      console.error(`Error processing file ${file.name}:`, error);
    }
  }

  // Mark search results as used in solution
  async markSearchResultUsed(incidentId: number, documentId: number): Promise<void> {
    await db
      .update(documentSearchResults)
      .set({ usedInSolution: true })
      .where(
        and(
          eq(documentSearchResults.incidentId, incidentId),
          eq(documentSearchResults.documentId, documentId)
        )
      );
  }

  // Get search analytics
  async getSearchAnalytics(): Promise<{
    totalSearches: number;
    successfulMatches: number;
    topDocuments: { document: Document; usageCount: number }[];
  }> {
    const totalSearches = await db
      .select({ count: sql<number>`count(*)` })
      .from(documentSearchResults);
    
    const successfulMatches = await db
      .select({ count: sql<number>`count(*)` })
      .from(documentSearchResults)
      .where(eq(documentSearchResults.usedInSolution, true));
    
    const topDocuments = await db
      .select({
        document: documents,
        usageCount: sql<number>`count(*)`,
      })
      .from(documentSearchResults)
      .innerJoin(documents, eq(documentSearchResults.documentId, documents.id))
      .where(eq(documentSearchResults.usedInSolution, true))
      .groupBy(documents.id)
      .orderBy(desc(sql`count(*)`))
      .limit(10);
    
    return {
      totalSearches: totalSearches[0]?.count || 0,
      successfulMatches: successfulMatches[0]?.count || 0,
      topDocuments,
    };
  }
}

export const documentService = new DocumentService();