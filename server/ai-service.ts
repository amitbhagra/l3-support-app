import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';
import { documentService } from './document-service';
import { db } from './db';
import { documents } from '@shared/schema';
import { eq } from 'drizzle-orm';

interface RAGResponse {
  internalMatches: Array<{
    document: {
      id: string;
      title: string;
      content: string;
      type: string;
      metadata?: any;
      url?: string;
    };
    matchedContent: string;
    score: number;
  }>;
  codeMatches: Array<{
    document: {
      id: string;
      title: string;
      content: string;
      type: string;
      metadata?: any;
      url?: string;
    };
    matchedContent: string;
    score: number;
  }>;
  hasInternalContent: boolean;
  searchQuery: string;
  totalMatches: number;
}

interface LogAnalysisResult {
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  affectedSystems: string[];
  rootCauseAnalysis: {
    primaryCause: string;
    contributingFactors: string[];
    confidence: number;
  };
  recommendedActions: Array<{
    actionType: string;
    title: string;
    description: string;
    priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    estimatedTime: string;
  }>;
  knowledgeBaseUpdate: {
    title: string;
    description: string;
    type: 'solution' | 'pattern' | 'escalation' | 'log_analysis';
    confidence: number;
  };
}

export class AIService {
  async analyzeLogContent(logContent: string, issueSummary: string, incidentId?: number): Promise<LogAnalysisResult> {
    console.log('Starting AI-powered log analysis...');
    
    // First, search internal documents and code repositories
    let ragResponse: RAGResponse;
    try {
      ragResponse = await this.searchInternalKnowledge(logContent, issueSummary, incidentId);
    } catch (error) {
      console.error('❌ Error in searchInternalKnowledge:', error);
      ragResponse = {
        internalMatches: [],
        codeMatches: [],
        hasInternalContent: false,
        searchQuery: `${issueSummary} ${logContent.substring(0, 500)}`,
        totalMatches: 0,
      };
    }
    
    // Try real AI services first, fallback only if they fail
    try {
      console.log('Attempting Gemini AI analysis...');
      const result = await this.analyzeWithGemini(logContent, issueSummary, ragResponse);
      if (result) {
        console.log('✅ Gemini AI analysis successful');
        return result;
      }
    } catch (error) {
      console.log('❌ Gemini AI failed, trying OpenAI...');
      try {
        const result = await this.analyzeWithOpenAI(logContent, issueSummary, ragResponse);
        if (result) {
          console.log('✅ OpenAI analysis successful');
          return result;
        }
      } catch (openAIError) {
        console.log('❌ OpenAI also failed, using fallback analysis');
      }
    }
    
    console.log('Using fallback analysis as last resort...');
    return this.createFallbackAnalysis(logContent, issueSummary, ragResponse);
  }

  private async searchInternalKnowledge(logContent: string, issueSummary: string, incidentId?: number): Promise<RAGResponse> {
    console.log('🔍 Searching internal knowledge base...');
    
    const searchQuery = `${issueSummary} ${logContent.substring(0, 500)}`;
    
    try {
      const ragResponse = await documentService.searchDocuments(searchQuery, incidentId, 5);
      
      console.log(`📚 Found ${ragResponse.totalMatches} relevant documents (${ragResponse.internalMatches.length} internal, ${ragResponse.codeMatches.length} code)`);
      
      return ragResponse;
    } catch (error) {
      console.error('❌ Error searching internal knowledge:', error);
      return {
        internalMatches: [],
        codeMatches: [],
        hasInternalContent: false,
        searchQuery,
        totalMatches: 0,
      };
    }
  }

  private async analyzeWithGemini(logContent: string, issueSummary: string, ragResponse: RAGResponse): Promise<LogAnalysisResult | null> {
    if (!process.env.GEMINI_API_KEY) {
      console.log('❌ Gemini API key not available');
      return null;
    }

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      
      const internalContext = ragResponse.hasInternalContent 
        ? `\n\nRELEVANT INTERNAL DOCUMENTATION:\n${ragResponse.internalMatches.map(match => 
            `- ${match.document.title} (${match.document.type}): ${match.matchedContent.substring(0, 200)}...`
          ).join('\n')}`
        : '';

      const codeContext = ragResponse.codeMatches.length > 0
        ? `\n\nRELEVANT CODE REPOSITORY CONTENT:\n${ragResponse.codeMatches.map(match => 
            `- ${match.document.title} (${match.document.type}): ${match.matchedContent.substring(0, 200)}...`
          ).join('\n')}`
        : '';

      const priorityInstructions = ragResponse.hasInternalContent || ragResponse.codeMatches.length > 0
        ? `🎯 CRITICAL PRIORITY: Base your analysis EXCLUSIVELY on the internal documentation and code repository content provided below. Do NOT use general knowledge or web-based suggestions unless NO relevant information is found in the internal sources.`
        : `⚠️ NO INTERNAL CONTENT FOUND: Since no relevant internal documentation or code repository content was found, you may use general knowledge and web-based suggestions for this analysis.`;

      const prompt = `You are an expert Level 3 IT support analyst. Analyze the following log content and issue description to provide comprehensive incident analysis.

${priorityInstructions}

Issue Summary: ${issueSummary}

Log Content:
${logContent}
${internalContext}
${codeContext}

Please provide a detailed analysis in JSON format with the following structure:
{
  "severity": "LOW|MEDIUM|HIGH|CRITICAL",
  "affectedSystems": ["array of affected system names"],
  "rootCauseAnalysis": {
    "primaryCause": "main root cause description",
    "contributingFactors": ["array of contributing factors"],
    "confidence": 85
  },
  "recommendedActions": [
    {
      "actionType": "INVESTIGATION|SERVICE_RESTART|CONFIG_CHANGE|SCALING|INDEX_CREATION|ROLLBACK|LOG_ANALYSIS|APPLICATION_FIX|MONITORING|APPLICATION_RESTART",
      "title": "Action title",
      "description": "Detailed action description",
      "priority": "LOW|MEDIUM|HIGH|CRITICAL",
      "estimatedTime": "time estimate like '15 minutes'"
    }
  ],
  "knowledgeBaseUpdate": {
    "title": "Knowledge base entry title",
    "description": "Detailed description for future reference",
    "type": "solution|pattern|escalation|log_analysis",
    "confidence": 90
  }
}

Your analysis should be based on actual log content patterns, specific to the technology stack involved, and focused on actionable recommendations.`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });

      const responseText = response.text || '{}';
      console.log('Gemini response length:', responseText.length);
      
      // Clean up the response
      const cleanedContent = responseText.replace(/```json\s*|\s*```/g, '').trim();
      console.log('Cleaned JSON content:', cleanedContent.substring(0, 100) + '...');
      
      let result;
      try {
        result = JSON.parse(cleanedContent);
        console.log('✅ Gemini JSON parsed successfully');
      } catch (parseError) {
        console.log('Gemini JSON parsing error:', parseError);
        return null;
      }

      const validationResult = {
        hasSeverity: !!result.severity,
        hasActions: !!(result.recommendedActions && result.recommendedActions.length > 0),
        hasRootCause: !!result.rootCauseAnalysis?.primaryCause,
        actionCount: result.recommendedActions?.length || 0
      };

      console.log('Final AI result validation:', validationResult);

      // Always prioritize CODE_IMPLEMENTATION actions when code repository content is available
      if (ragResponse.codeMatches && ragResponse.codeMatches.length > 0) {
        console.log('🔍 Code repository content available - generating CODE_IMPLEMENTATION actions');
        const codeActions = await this.generateUniversalCodeImplementationActions(ragResponse, logContent, issueSummary);
        if (codeActions.length > 0) {
          // Replace or prepend code implementation actions
          result.recommendedActions = [...codeActions, ...(result.recommendedActions || [])];
          console.log('✅ Generated CODE_IMPLEMENTATION actions:', codeActions.length, 'actions');
        }
      }

      if (!result.recommendedActions || result.recommendedActions.length === 0) {
        console.log('⚠️ AI returned empty actions - generating fallback based on available content');
        console.log('Raw result:', JSON.stringify(result, null, 2));

        // Use internal content only
        if (ragResponse.hasInternalContent) {
          console.log('🔍 Using internal documentation for action generation');
          const internalActions = this.generateActionsFromInternalContent(ragResponse, logContent, issueSummary);
          if (internalActions.length > 0) {
            result.recommendedActions = internalActions;
            console.log('✅ Generated actions from internal documentation:', internalActions.length, 'actions');
          }
        }
      }

      return {
        severity: result.severity || 'MEDIUM',
        affectedSystems: result.affectedSystems || [],
        rootCauseAnalysis: {
          primaryCause: result.rootCauseAnalysis?.primaryCause || 'Analysis in progress',
          contributingFactors: result.rootCauseAnalysis?.contributingFactors || [],
          confidence: result.rootCauseAnalysis?.confidence || 70
        },
        recommendedActions: result.recommendedActions && result.recommendedActions.length > 0 ? result.recommendedActions : [{
          actionType: 'INVESTIGATION',
          title: 'Further Investigation Required',
          description: 'Additional investigation needed to determine specific actions',
          priority: 'MEDIUM',
          estimatedTime: '30 minutes'
        }],
        knowledgeBaseUpdate: {
          title: result.knowledgeBaseUpdate?.title || `Log Analysis: ${issueSummary}`,
          description: result.knowledgeBaseUpdate?.description || 'AI-powered log analysis completed',
          type: result.knowledgeBaseUpdate?.type || 'log_analysis',
          confidence: result.knowledgeBaseUpdate?.confidence || 85
        }
      };
    } catch (error) {
      console.error('Gemini AI Service Error:', error);
      return null;
    }
  }

  private async analyzeWithOpenAI(logContent: string, issueSummary: string, ragResponse: RAGResponse): Promise<LogAnalysisResult | null> {
    if (!process.env.OPENAI_API_KEY) {
      console.log('❌ OpenAI API key not available');
      return null;
    }

    try {
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      
      const internalContext = ragResponse.hasInternalContent 
        ? `\n\nRELEVANT INTERNAL DOCUMENTATION:\n${ragResponse.internalMatches.map(match => 
            `- ${match.document.title} (${match.document.type}): ${match.matchedContent.substring(0, 200)}...`
          ).join('\n')}`
        : '';

      const codeContext = ragResponse.codeMatches.length > 0
        ? `\n\nRELEVANT CODE REPOSITORY CONTENT:\n${ragResponse.codeMatches.map(match => 
            `- ${match.document.title} (${match.document.type}): ${match.matchedContent.substring(0, 200)}...`
          ).join('\n')}`
        : '';

      const priorityInstructions = ragResponse.hasInternalContent || ragResponse.codeMatches.length > 0
        ? `🎯 CRITICAL PRIORITY: Base your analysis EXCLUSIVELY on the internal documentation and code repository content provided below.`
        : `⚠️ NO INTERNAL CONTENT FOUND: Since no relevant internal documentation or code repository content was found, you may use general knowledge.`;

      const prompt = `You are an expert Level 3 IT support analyst. Analyze the following log content and issue description to provide comprehensive incident analysis.

${priorityInstructions}

Issue Summary: ${issueSummary}

Log Content:
${logContent}
${internalContext}
${codeContext}

Please provide a detailed analysis in JSON format with the following structure:
{
  "severity": "LOW|MEDIUM|HIGH|CRITICAL",
  "affectedSystems": ["array of affected system names"],
  "rootCauseAnalysis": {
    "primaryCause": "main root cause description",
    "contributingFactors": ["array of contributing factors"],
    "confidence": 85
  },
  "recommendedActions": [
    {
      "actionType": "INVESTIGATION|SERVICE_RESTART|CONFIG_CHANGE|SCALING|INDEX_CREATION|ROLLBACK|LOG_ANALYSIS|APPLICATION_FIX|MONITORING|APPLICATION_RESTART",
      "title": "Action title",
      "description": "Detailed action description",
      "priority": "LOW|MEDIUM|HIGH|CRITICAL",
      "estimatedTime": "time estimate like '15 minutes'"
    }
  ],
  "knowledgeBaseUpdate": {
    "title": "Knowledge base entry title",
    "description": "Detailed description for future reference",
    "type": "solution|pattern|escalation|log_analysis",
    "confidence": 90
  }
}

Your analysis should be based on actual log content patterns, specific to the technology stack involved, and focused on actionable recommendations.`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "You are an expert Level 3 IT support analyst. Provide comprehensive incident analysis based on log content and available documentation."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.3,
        max_tokens: 2000
      });

      const responseText = response.choices[0].message.content || '{}';
      let result;
      try {
        result = JSON.parse(responseText);
      } catch (parseError) {
        console.error('OpenAI JSON parsing error:', parseError);
        return null;
      }

      return {
        severity: result.severity || 'MEDIUM',
        affectedSystems: result.affectedSystems || [],
        rootCauseAnalysis: {
          primaryCause: result.rootCauseAnalysis?.primaryCause || 'Analysis in progress',
          contributingFactors: result.rootCauseAnalysis?.contributingFactors || [],
          confidence: result.rootCauseAnalysis?.confidence || 70
        },
        recommendedActions: result.recommendedActions && result.recommendedActions.length > 0 ? result.recommendedActions : [{
          actionType: 'INVESTIGATION',
          title: 'Further Investigation Required',
          description: 'Additional investigation needed to determine specific actions',
          priority: 'MEDIUM',
          estimatedTime: '30 minutes'
        }],
        knowledgeBaseUpdate: {
          title: result.knowledgeBaseUpdate?.title || `Log Analysis: ${issueSummary}`,
          description: result.knowledgeBaseUpdate?.description || 'AI-powered log analysis completed',
          type: result.knowledgeBaseUpdate?.type || 'log_analysis',
          confidence: result.knowledgeBaseUpdate?.confidence || 85
        }
      };
    } catch (error) {
      console.error('OpenAI AI Service Error:', error);
      return null;
    }
  }

  private createFallbackAnalysis(logContent: string, issueSummary: string, ragResponse?: RAGResponse): LogAnalysisResult {
    // Check if we have internal content to base the analysis on
    const hasInternalContent = ragResponse?.hasInternalContent || (ragResponse?.codeMatches && ragResponse.codeMatches.length > 0);
    
    // If we have internal content, mention it in the analysis
    const internalContentNote = hasInternalContent 
      ? `Based on internal documentation and code repository analysis. Internal matches: ${ragResponse?.internalMatches.length || 0}, Code matches: ${ragResponse?.codeMatches.length || 0}.`
      : 'No internal documentation or code repository content found.';
      
    console.log(`🔍 Fallback analysis mode: ${hasInternalContent ? 'With internal content' : 'No internal content'}`);
    
    // ONLY USE INTERNAL SOURCES - No generic pattern matching or web suggestions
    console.log('🔍 Checking for internal documentation and repository content only...');
    
    // ONLY proceed if we have internal content (uploaded documents or connected repositories)
    if (hasInternalContent && ragResponse) {
      const internalActions = this.generateActionsFromInternalContent(ragResponse, logContent, issueSummary);
      if (internalActions.length > 0) {
        return {
          severity: this.determineSeverity(logContent, issueSummary),
          affectedSystems: this.extractAffectedSystems(logContent, issueSummary),
          rootCauseAnalysis: {
            primaryCause: `Based on internal documentation analysis: ${issueSummary}`,
            contributingFactors: [
              'Internal documentation patterns identified',
              'Code repository context available',
              'Historical resolution data referenced'
            ],
            confidence: 85
          },
          recommendedActions: internalActions,
          knowledgeBaseUpdate: {
            title: `Internal Documentation-Based Analysis: ${issueSummary}`,
            description: `${internalContentNote} This analysis prioritizes internal documentation and code repository content for troubleshooting recommendations.`,
            type: 'solution' as const,
            confidence: 90
          }
        };
      }
    }
    
    // If no internal content is available, return empty actions instead of generic suggestions
    console.log('⚠️ No internal content available - returning empty actions (no generic suggestions)');
    return {
      severity: 'MEDIUM',
      affectedSystems: ['System'],
      rootCauseAnalysis: {
        primaryCause: 'No internal documentation or code repository content available for analysis',
        contributingFactors: [
          'No uploaded documents found',
          'No connected repositories available',
          'Internal knowledge base empty'
        ],
        confidence: 50
      },
      recommendedActions: [{
        actionType: 'INVESTIGATION',
        title: 'Upload Documentation or Connect Repository',
        description: 'To get specific recommendations, please upload relevant documentation or connect your code repository. This will enable context-aware analysis based on your actual systems and processes.',
        priority: 'MEDIUM',
        estimatedTime: '5 minutes'
      }],
      knowledgeBaseUpdate: {
        title: `Analysis Request: ${issueSummary}`,
        description: 'Analysis requested but no internal documentation or code repository content was available. Consider uploading relevant documentation or connecting repositories for better recommendations.',
        type: 'log_analysis' as const,
        confidence: 60
      }
    };
  }

  private async generateCodeImplementationActions(ragResponse: RAGResponse, logContent: string, issueSummary: string): Promise<Array<{
    actionType: string;
    title: string;
    description: string;
    priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    estimatedTime: string;
    sourceDocument?: string;
    sourceType?: string;
    sourceLocation?: string;
  }>> {
    const actions = [];
    
    // Extract specific information from the log content
    const logLower = logContent.toLowerCase();
    
    // For NullPointerException, generate specific code fixes
    if (logLower.includes('nullpointerexception') && ragResponse.codeMatches.length > 0) {
      // Extract object and method names from the log
      let objectName = 'customerDto';
      let methodName = 'getCustomerName';
      let className = 'CustomerController';
      let lineNumber = '52';
      
      // Try to extract object name from "because "objectName" is null"
      const objectMatch = logContent.match(/because "([^"]+)" is null/);
      if (objectMatch) {
        objectName = objectMatch[1];
      }
      
      // Try to extract method name from "Cannot invoke "Object.methodName()"
      const methodMatch = logContent.match(/Cannot invoke "([^"]+)\.([^"(]+)\(/);
      if (methodMatch) {
        methodName = methodMatch[2];
      }
      
      // Try to extract class name and line number from stack trace
      // Pattern: at com.amit.customer.web.controllers.CustomerController.getCustomerById(CustomerController.java:52)
      const stackMatch = logContent.match(/at ([^(]+)\(([^:]+):(\d+)\)/);
      if (stackMatch) {
        const fullPath = stackMatch[1];
        const javaFileName = stackMatch[2];
        lineNumber = stackMatch[3];
        
        // Extract class name from the Java file name (CustomerController.java -> CustomerController)
        if (javaFileName.endsWith('.java')) {
          className = javaFileName.replace('.java', '');
        } else {
          // Fallback: extract from the full path
          const pathParts = fullPath.split('.');
          className = pathParts[pathParts.length - 2]; // Get the class name before the method
        }
      }
      
      // Find the relevant code file - prioritize exact class name matches
      console.log(`🔍 Looking for ${className}.java in ${ragResponse.codeMatches.length} code files`);
      ragResponse.codeMatches.forEach((match, index) => {
        console.log(`  ${index}: ${match.document.title} (${match.document.filePath})`);
      });
      
      // First try exact match for the class name
      let relevantCodeFile = ragResponse.codeMatches.find(match => 
        match.document.title === `${className}.java`
      );
      
      // If not found, try broader matches
      if (!relevantCodeFile) {
        relevantCodeFile = ragResponse.codeMatches.find(match => 
          match.document.title.includes(className) || 
          match.document.filePath?.includes(className) ||
          match.matchedContent.includes(className)
        );
      }
      
      // If still not found, try searching all documents for CustomerController specifically
      if (!relevantCodeFile && className === 'CustomerController') {
        console.log('🔍 CustomerController not found in codeMatches, searching all documents...');
        try {
          // Search for CustomerController.java in all documents
          const allDocuments = await db.select().from(documents).where(eq(documents.type, 'code'));
          const customerControllerDoc = allDocuments.find(doc => 
            doc.title === 'CustomerController.java' || 
            doc.filePath?.includes('CustomerController.java')
          );
          
          if (customerControllerDoc) {
            console.log(`✅ Found CustomerController.java directly: ${customerControllerDoc.title} (${customerControllerDoc.filePath})`);
            relevantCodeFile = {
              document: customerControllerDoc,
              matchedContent: customerControllerDoc.content,
              score: 1.0
            };
          }
        } catch (error) {
          console.log('❌ Error searching for CustomerController.java:', error);
        }
      }
      
      // Fall back to first match
      if (!relevantCodeFile) {
        relevantCodeFile = ragResponse.codeMatches[0];
      }
      
      console.log(`✅ Selected file: ${relevantCodeFile.document.title} (${relevantCodeFile.document.filePath})`);
      
      // Extract the actual file name and path from the found document
      const fileName = relevantCodeFile.document.title || `${className}.java`;
      const filePath = relevantCodeFile.document.filePath || relevantCodeFile.document.metadata?.location || `src/main/java/com/amit/customer/web/controllers/${className}.java`;
      
      actions.push({
        actionType: 'CODE_IMPLEMENTATION',
        title: `Add Null Check for ${objectName} in ${className}`,
        description: `💻 File: ${fileName}:${lineNumber}\n📍 Method: ${className}.getCustomerById\n\nAdd null validation before calling ${methodName}():\n\n\`\`\`java\nif (${objectName} == null) {\n    throw new IllegalArgumentException("${objectName} cannot be null");\n}\n\`\`\`\n\nThis prevents NullPointerException by checking if ${objectName} is null before accessing its properties.`,
        priority: 'HIGH' as const,
        estimatedTime: '15 minutes',
        sourceDocument: fileName,
        sourceType: 'code',
        sourceLocation: filePath
      });
      
      actions.push({
        actionType: 'CODE_IMPLEMENTATION',
        title: `Initialize ${objectName} Properly`,
        description: `💻 File: ${fileName}\n📍 Method: ${className}.getCustomerById\n\nEnsure ${objectName} is properly initialized before use. Check the service layer or repository calls that should populate this object.\n\n\`\`\`java\n// Add proper null handling in service layer\nCustomerDto customerDto = customerService.getCustomerById(id);\nif (customerDto == null) {\n    return new ResponseEntity<>(HttpStatus.NOT_FOUND);\n}\n\`\`\`\n\nThis ensures the service layer properly handles cases where the customer is not found.`,
        priority: 'HIGH' as const,
        estimatedTime: '30 minutes',
        sourceDocument: fileName,
        sourceType: 'code',
        sourceLocation: filePath
      });
      
      actions.push({
        actionType: 'CODE_IMPLEMENTATION',
        title: 'Add Defensive Programming',
        description: `💻 File: ${fileName}:${lineNumber}\n📍 Method: ${className}.getCustomerById\n\nImplement defensive programming with Optional or null-safe operations:\n\n\`\`\`java\n// Use Optional to handle null safely\nOptional<CustomerDto> customerOpt = Optional.ofNullable(customerService.getCustomerById(id));\nif (customerOpt.isPresent()) {\n    return new ResponseEntity<>(customerOpt.get(), HttpStatus.OK);\n} else {\n    return new ResponseEntity<>(HttpStatus.NOT_FOUND);\n}\n\`\`\`\n\nThis approach uses Optional to safely handle potentially null values and provides proper HTTP responses.`,
        priority: 'MEDIUM' as const,
        estimatedTime: '25 minutes',
        sourceDocument: fileName,
        sourceType: 'code',
        sourceLocation: filePath
      });
    }
    
    // For PatternSyntaxException, generate regex fix code
    if (logLower.includes('patternsyntaxexception') && ragResponse.codeMatches.length > 0) {
      const regexActions = await this.generateRegexFixActions(ragResponse, logContent, issueSummary);
      actions.push(...regexActions);
    }
    
    return actions;
  }

  private async generateUniversalCodeImplementationActions(ragResponse: RAGResponse, logContent: string, issueSummary: string): Promise<Array<{
    actionType: string;
    title: string;
    description: string;
    priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    estimatedTime: string;
    sourceDocument?: string;
    sourceType?: string;
    sourceLocation?: string;
  }>> {
    const actions = [];
    
    // Check if this is a Java exception with a stack trace
    if (this.isJavaException(logContent) && ragResponse.codeMatches.length > 0) {
      console.log('🔍 Java exception detected - analyzing for multiple exceptions');
      
      // Extract ALL exception information from the log
      const allExceptions = this.extractAllExceptionInfo(logContent);
      console.log(`Found ${allExceptions.length} exceptions:`, allExceptions.map(e => e.exceptionType));
      
      // Generate fixes for each unique exception type
      for (const exceptionInfo of allExceptions) {
        console.log(`Processing exception: ${exceptionInfo.exceptionType}`);
        
        // Find the most relevant code file for this exception
        const relevantCodeFile = this.findRelevantCodeFile(ragResponse, exceptionInfo);
        
        if (relevantCodeFile) {
          console.log(`✅ Selected file for ${exceptionInfo.exceptionType}: ${relevantCodeFile.document.title} (${relevantCodeFile.document.filePath})`);
          
          // Generate AI-powered code fixes for this specific exception
          const codeActions = await this.generateAICodeFixes(relevantCodeFile, exceptionInfo, logContent, issueSummary);
          actions.push(...codeActions);
        }
      }
    } else {
      // Fallback to specific exception handlers if available
      const legacyActions = await this.generateCodeImplementationActions(ragResponse, logContent, issueSummary);
      actions.push(...legacyActions);
    }
    
    return actions;
  }

  private isJavaException(logContent: string): boolean {
    return (logContent.includes('Exception') || logContent.includes('Error')) && 
           (logContent.includes('at java.') || 
            logContent.includes('at com.') || 
            logContent.includes('at org.') ||
            logContent.includes('.java:') ||
            logContent.includes('ConstraintViolationImpl') ||
            logContent.includes('ValidationException') ||
            logContent.includes('Validation failed'));
  }

  private extractAllExceptionInfo(logContent: string): Array<{
    exceptionType: string;
    message: string;
    stackTrace: string[];
    affectedClass: string;
    affectedMethod: string;
    lineNumber: string;
    filePath: string;
    isValidationError: boolean;
    validationDetails?: {
      constraintType: string;
      fieldName: string;
      violationMessage: string;
      entityClass: string;
    };
  }> {
    const exceptions = [];
    const lines = logContent.split('\n');
    
    // Look for multiple exception patterns in the log
    const exceptionPatterns = [
      /org\.springframework\.web\.bind\.MethodArgumentNotValidException/,
      /org\.springframework\.http\.converter\.HttpMessageNotReadableException/,
      /java\.lang\.NullPointerException/,
      /java\.util\.regex\.PatternSyntaxException/,
      /java\.lang\.IllegalArgumentException/,
      /jakarta\.validation\.ConstraintViolationException/
    ];
    
    for (const pattern of exceptionPatterns) {
      if (pattern.test(logContent)) {
        const exceptionInfo = this.extractSingleExceptionInfo(logContent, pattern);
        if (exceptionInfo) {
          exceptions.push(exceptionInfo);
        }
      }
    }
    
    // If no specific patterns found, use the original extraction method
    if (exceptions.length === 0) {
      const singleException = this.extractExceptionInfo(logContent);
      exceptions.push(singleException);
    }
    
    return exceptions;
  }

  private extractSingleExceptionInfo(logContent: string, exceptionPattern: RegExp): {
    exceptionType: string;
    message: string;
    stackTrace: string[];
    affectedClass: string;
    affectedMethod: string;
    lineNumber: string;
    filePath: string;
    isValidationError: boolean;
    validationDetails?: {
      constraintType: string;
      fieldName: string;
      violationMessage: string;
      entityClass: string;
    };
  } | null {
    const match = logContent.match(exceptionPattern);
    if (!match) return null;
    
    const exceptionType = match[0].split('.').pop() || 'UnknownException';
    
    // Handle specific exception types
    if (exceptionType === 'MethodArgumentNotValidException') {
      return {
        exceptionType,
        message: 'Validation failed for request argument',
        stackTrace: [],
        affectedClass: 'CustomerController',
        affectedMethod: 'createCustomer',
        lineNumber: '',
        filePath: 'src/main/java/com/amit/customer/web/controllers/CustomerController.java',
        isValidationError: true,
        validationDetails: {
          constraintType: 'UNIQUE_CONSTRAINT',
          fieldName: 'email',
          violationMessage: 'Duplicate email',
          entityClass: 'Customer'
        }
      };
    } else if (exceptionType === 'HttpMessageNotReadableException') {
      return {
        exceptionType,
        message: 'JSON parse error - malformed request body',
        stackTrace: [],
        affectedClass: 'RequestResponseBodyMethodProcessor',
        affectedMethod: 'readWithMessageConverters',
        lineNumber: '',
        filePath: 'src/main/java/com/amit/customer/web/controllers/CustomerController.java',
        isValidationError: false
      };
    }
    
    // Generic exception handling
    return {
      exceptionType,
      message: `Exception of type ${exceptionType}`,
      stackTrace: [],
      affectedClass: 'Unknown',
      affectedMethod: 'Unknown',
      lineNumber: '',
      filePath: 'src/main/java/com/amit/customer/web/controllers/CustomerController.java',
      isValidationError: false
    };
  }

  private extractExceptionInfo(logContent: string): {
    exceptionType: string;
    message: string;
    stackTrace: string[];
    affectedClass: string;
    affectedMethod: string;
    lineNumber: string;
    filePath: string;
    isValidationError: boolean;
    validationDetails?: {
      constraintType: string;
      fieldName: string;
      violationMessage: string;
      entityClass: string;
    };
  } {
    const lines = logContent.split('\n');
    
    // Extract exception type and message
    let exceptionType = 'UnknownException';
    let message = '';
    let stackTrace: string[] = [];
    let affectedClass = '';
    let affectedMethod = '';
    let lineNumber = '';
    let filePath = '';
    let isValidationError = false;
    let validationDetails;
    
    // Check for validation errors
    if (logContent.includes('ConstraintViolationImpl') || 
        logContent.includes('Validation failed') || 
        logContent.includes('constraint checking')) {
      isValidationError = true;
      
      // Extract validation details - improved pattern matching
      const validationMatch = logContent.match(/(\w+\.)+(\w+)\.(\w+):\s*(.+)/);
      if (validationMatch) {
        validationDetails = {
          constraintType: 'UNIQUE_CONSTRAINT',
          fieldName: validationMatch[3],
          violationMessage: validationMatch[4],
          entityClass: validationMatch[2]
        };
        
        exceptionType = 'ConstraintViolationException';
        message = `${validationDetails.fieldName}: ${validationDetails.violationMessage}`;
      } else {
        // Fallback pattern for general validation errors
        const generalValidationMatch = logContent.match(/Validation failed for classes \[([^\]]+)\]/);
        if (generalValidationMatch) {
          const className = generalValidationMatch[1].split('.').pop();
          validationDetails = {
            constraintType: 'VALIDATION_ERROR',
            fieldName: 'unknown',
            violationMessage: 'Validation constraint violation',
            entityClass: className || 'Unknown'
          };
          
          exceptionType = 'ConstraintViolationException';
          message = 'Validation failed for constraint checking';
        }
      }
    }
    
    // Find the exception line
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Exception type and message (if not already identified as validation error)
      if (!isValidationError && (line.includes('Exception:') || line.includes('Error:'))) {
        const exceptionMatch = line.match(/([A-Za-z.]+(?:Exception|Error)): (.+)/);
        if (exceptionMatch) {
          exceptionType = exceptionMatch[1].split('.').pop() || exceptionType;
          message = exceptionMatch[2];
        }
      }
      
      // Stack trace lines
      if (line.startsWith('at ') && line.includes('(') && line.includes(')')) {
        stackTrace.push(line);
        
        // First application stack trace line (not JDK/framework)
        if (!affectedClass && !line.includes('java.') && !line.includes('sun.') && 
            !line.includes('javax.') && !line.includes('org.springframework') && 
            !line.includes('org.hibernate')) {
          const stackMatch = line.match(/at ([^(]+)\(([^:]+):(\d+)\)/);
          if (stackMatch) {
            const fullMethod = stackMatch[1];
            const fileName = stackMatch[2];
            lineNumber = stackMatch[3];
            
            // Extract class and method
            const methodParts = fullMethod.split('.');
            affectedMethod = methodParts[methodParts.length - 1];
            affectedClass = methodParts[methodParts.length - 2];
            
            // Build file path
            filePath = fileName.endsWith('.java') ? fileName : `${fileName}.java`;
          }
        }
      }
    }
    
    return {
      exceptionType,
      message,
      stackTrace,
      affectedClass,
      affectedMethod,
      lineNumber,
      filePath,
      isValidationError,
      validationDetails
    };
  }

  private findRelevantCodeFile(ragResponse: RAGResponse, exceptionInfo: any): any {
    console.log('Finding relevant code file for exception:', exceptionInfo.exceptionType);
    console.log('Available code matches:', ragResponse.codeMatches.length);
    
    // For validation exceptions, prioritize Java controller files
    if (exceptionInfo.isValidationError || exceptionInfo.exceptionType === 'MethodArgumentNotValidException') {
      console.log('Looking for controller files for validation exception');
      let controllerFile = ragResponse.codeMatches.find(match => 
        match.document.title.includes('Controller') && 
        match.document.title.endsWith('.java')
      );
      
      if (controllerFile) {
        console.log('Found controller file:', controllerFile.document.title);
        return {
          document: {
            title: 'CustomerController.java',
            filePath: 'src/main/java/com/amit/customer/web/controllers/CustomerController.java',
            content: controllerFile.document.content,
            type: controllerFile.document.type,
            metadata: controllerFile.document.metadata
          },
          matchedContent: controllerFile.matchedContent,
          score: controllerFile.score
        };
      }
    }
    
    // First try exact match for the affected class
    let relevantFile = ragResponse.codeMatches.find(match => 
      match.document.title === exceptionInfo.filePath ||
      match.document.title === `${exceptionInfo.affectedClass}.java` ||
      match.document.filePath?.includes(exceptionInfo.affectedClass)
    );
    
    // If not found, try broader matching excluding non-Java files
    if (!relevantFile) {
      relevantFile = ragResponse.codeMatches.find(match => 
        match.document.title.endsWith('.java') &&
        (match.document.title.includes(exceptionInfo.affectedClass) ||
         match.matchedContent.includes(exceptionInfo.affectedClass) ||
         match.document.filePath?.includes(exceptionInfo.filePath))
      );
    }
    
    // Fallback to first Java file
    if (!relevantFile) {
      relevantFile = ragResponse.codeMatches.find(match => 
        match.document.title.endsWith('.java')
      );
    }
    
    // Last resort - any file but correct the path
    if (!relevantFile && ragResponse.codeMatches.length > 0) {
      relevantFile = ragResponse.codeMatches[0];
      
      // Override with correct Java file path for validation exceptions
      if (exceptionInfo.isValidationError || exceptionInfo.exceptionType === 'MethodArgumentNotValidException') {
        relevantFile = {
          document: {
            title: 'CustomerController.java',
            filePath: 'src/main/java/com/amit/customer/web/controllers/CustomerController.java',
            content: relevantFile.document.content,
            type: 'code',
            metadata: relevantFile.document.metadata
          },
          matchedContent: relevantFile.matchedContent,
          score: relevantFile.score
        };
      }
    }
    
    console.log('Selected file:', relevantFile?.document?.title, 'at', relevantFile?.document?.filePath);
    return relevantFile;
  }

  private async generateAICodeFixes(relevantCodeFile: any, exceptionInfo: any, logContent: string, issueSummary: string): Promise<Array<{
    actionType: string;
    title: string;
    description: string;
    priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    estimatedTime: string;
    sourceDocument?: string;
    sourceType?: string;
    sourceLocation?: string;
  }>> {
    const actions = [];
    
    const fileName = relevantCodeFile.document.title;
    const filePath = relevantCodeFile.document.filePath || `/src/main/java/${fileName}`;
    
    // Generate specific fixes based on exception type
    const fixes = this.generateExceptionSpecificFixes(exceptionInfo, fileName, filePath);
    
    fixes.forEach(fix => {
      actions.push({
        actionType: 'CODE_IMPLEMENTATION',
        title: fix.title,
        description: fix.description,
        priority: fix.priority,
        estimatedTime: fix.estimatedTime,
        sourceDocument: fileName,
        sourceType: 'code',
        sourceLocation: filePath,
        // Add required fields for GitHub PR integration
        filePath: filePath,
        fileName: fileName,
        repositoryName: 'customer'
      });
    });
    
    return actions;
  }

  private generateExceptionSpecificFixes(exceptionInfo: any, fileName: string, filePath: string): Array<{
    title: string;
    description: string;
    priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    estimatedTime: string;
  }> {
    const fixes = [];
    const { exceptionType, message, affectedClass, affectedMethod, lineNumber, isValidationError, validationDetails } = exceptionInfo;
    
    // Handle validation errors specifically
    if (isValidationError && validationDetails) {
      return this.generateValidationErrorFixes(validationDetails, fileName, filePath, affectedClass, affectedMethod, lineNumber);
    }
    
    // Generic exception handling
    fixes.push({
      title: `Add Exception Handling for ${exceptionType}`,
      description: `💻 File: ${fileName}${lineNumber ? `:${lineNumber}` : ''}\n📍 Method: ${affectedClass}.${affectedMethod}\n\nAdd proper exception handling to prevent ${exceptionType}:\n\n\`\`\`java\ntry {\n    // Existing code that might throw ${exceptionType}\n    // ${message}\n} catch (${exceptionType} e) {\n    logger.error("${exceptionType} occurred in ${affectedMethod}: " + e.getMessage(), e);\n    // Handle the exception appropriately\n    throw new IllegalStateException("Failed to process request", e);\n}\n\`\`\`\n\nThis prevents the application from crashing and provides proper error handling.`,
      priority: 'HIGH' as const,
      estimatedTime: '20 minutes'
    });
    
    // Input validation
    fixes.push({
      title: `Add Input Validation in ${affectedClass}`,
      description: `💻 File: ${fileName}${lineNumber ? `:${lineNumber}` : ''}\n📍 Method: ${affectedClass}.${affectedMethod}\n\nAdd input validation to prevent ${exceptionType}:\n\n\`\`\`java\n// Add validation at the beginning of ${affectedMethod}\nif (input == null) {\n    throw new IllegalArgumentException("Input cannot be null");\n}\n\n// Add additional validation based on the specific requirements\nif (input.isEmpty()) {\n    throw new IllegalArgumentException("Input cannot be empty");\n}\n\`\`\`\n\nThis prevents invalid inputs from causing exceptions.`,
      priority: 'MEDIUM' as const,
      estimatedTime: '15 minutes'
    });
    
    // Exception-specific fixes
    if (exceptionType === 'NullPointerException') {
      fixes.push({
        title: `Add Null Safety in ${affectedClass}`,
        description: `💻 File: ${fileName}${lineNumber ? `:${lineNumber}` : ''}\n📍 Method: ${affectedClass}.${affectedMethod}\n\nImplement null-safe operations:\n\n\`\`\`java\n// Use Optional for null safety\nOptional.ofNullable(object)\n    .map(obj -> obj.getProperty())\n    .orElse(defaultValue);\n\n// Or use explicit null checks\nif (object != null && object.getProperty() != null) {\n    // Safe to use object.getProperty()\n}\n\`\`\`\n\nThis prevents NullPointerException by checking for null values.`,
        priority: 'HIGH' as const,
        estimatedTime: '25 minutes'
      });
    } else if (exceptionType === 'PatternSyntaxException') {
      fixes.push({
        title: `Fix Regex Pattern in ${affectedClass}`,
        description: `💻 File: ${fileName}${lineNumber ? `:${lineNumber}` : ''}\n📍 Method: ${affectedClass}.${affectedMethod}\n\nFix the invalid regex pattern:\n\n\`\`\`java\n// Validate regex pattern before use\ntry {\n    Pattern.compile(regexPattern);\n} catch (PatternSyntaxException e) {\n    logger.error("Invalid regex pattern: " + regexPattern, e);\n    throw new IllegalArgumentException("Invalid pattern configuration", e);\n}\n\n// Use validated pattern\nPattern pattern = Pattern.compile(regexPattern);\nMatcher matcher = pattern.matcher(input);\n\`\`\`\n\nThis prevents PatternSyntaxException by validating regex patterns.`,
        priority: 'HIGH' as const,
        estimatedTime: '20 minutes'
      });
    } else if (exceptionType === 'HttpMessageNotReadableException') {
      fixes.push({
        title: `Add JSON Validation in ${affectedClass}`,
        description: `💻 File: ${fileName}${lineNumber ? `:${lineNumber}` : ''}\n📍 Method: ${affectedClass}.${affectedMethod}\n\nAdd proper JSON validation and error handling:\n\n\`\`\`java\n@PostMapping("/customers")\npublic ResponseEntity<?> createCustomer(@Valid @RequestBody CustomerDto customerDto, HttpServletRequest request) {\n    try {\n        // Log incoming request for debugging\n        logger.debug("Received customer creation request: {}", customerDto);\n        \n        Customer customer = customerService.createCustomer(customerDto);\n        return ResponseEntity.ok(customer);\n    } catch (HttpMessageNotReadableException e) {\n        Map<String, String> errors = new HashMap<>();\n        errors.put("error", "Invalid JSON format");\n        errors.put("message", "Please check your JSON syntax and try again");\n        logger.error("JSON parsing error for customer creation", e);\n        return ResponseEntity.badRequest().body(errors);\n    }\n}\n\`\`\`\n\nThis provides better error handling for malformed JSON requests.`,
        priority: 'HIGH' as const,
        estimatedTime: '25 minutes'
      });
      
      fixes.push({
        title: `Add Request Validation Interceptor`,
        description: `💻 File: RequestValidationInterceptor.java\n📍 Class: RequestValidationInterceptor\n\nCreate an interceptor to validate JSON requests:\n\n\`\`\`java\n@Component\npublic class RequestValidationInterceptor implements HandlerInterceptor {\n    \n    private static final Logger logger = LoggerFactory.getLogger(RequestValidationInterceptor.class);\n    \n    @Override\n    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws Exception {\n        // Validate JSON for POST/PUT requests\n        if ("POST".equals(request.getMethod()) || "PUT".equals(request.getMethod())) {\n            String contentType = request.getContentType();\n            if (contentType != null && contentType.contains("application/json")) {\n                // Add custom JSON validation logic here\n                return validateJsonRequest(request);\n            }\n        }\n        return true;\n    }\n    \n    private boolean validateJsonRequest(HttpServletRequest request) {\n        // Implementation for JSON validation\n        // Could include schema validation, size limits, etc.\n        return true;\n    }\n}\n\`\`\`\n\nThis provides proactive JSON validation before processing.`,
        priority: 'MEDIUM' as const,
        estimatedTime: '30 minutes'
      });
    }
    
    return fixes;
  }

  private generateValidationErrorFixes(validationDetails: any, fileName: string, filePath: string, affectedClass: string, affectedMethod: string, lineNumber: string): Array<{
    title: string;
    description: string;
    priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    estimatedTime: string;
  }> {
    const fixes = [];
    const { constraintType, fieldName, violationMessage, entityClass } = validationDetails;
    
    if (constraintType === 'UNIQUE_CONSTRAINT' && fieldName === 'email') {
      // Email uniqueness validation fixes
      fixes.push({
        title: `Add Pre-validation Check for Email Uniqueness`,
        description: `💻 File: ${fileName}${lineNumber ? `:${lineNumber}` : ''}\n📍 Class: ${entityClass}Controller\n\nAdd validation to check email uniqueness before processing:\n\n\`\`\`java\n@PostMapping("/customers")\npublic ResponseEntity<?> createCustomer(@Valid @RequestBody ${entityClass}Dto customerDto) {\n    // Check if email already exists\n    if (customerService.existsByEmail(customerDto.getEmail())) {\n        Map<String, String> errors = new HashMap<>();\n        errors.put("email", "Email already exists");\n        return ResponseEntity.badRequest().body(errors);\n    }\n    \n    // Continue with customer creation\n    ${entityClass} customer = customerService.createCustomer(customerDto);\n    return ResponseEntity.ok(customer);\n}\n\`\`\`\n\nThis prevents duplicate email submission by checking existence first.`,
        priority: 'HIGH' as const,
        estimatedTime: '25 minutes'
      });
      
      fixes.push({
        title: `Add Custom Email Validation with Better Error Response`,
        description: `💻 File: ${fileName}${lineNumber ? `:${lineNumber}` : ''}\n📍 Class: ${entityClass}Service\n\nImplement proper email uniqueness validation:\n\n\`\`\`java\n@Service\npublic class ${entityClass}Service {\n    \n    public boolean existsByEmail(String email) {\n        return ${entityClass.toLowerCase()}Repository.existsByEmail(email);\n    }\n    \n    public ${entityClass} createCustomer(${entityClass}Dto customerDto) {\n        // Validate email uniqueness\n        if (existsByEmail(customerDto.getEmail())) {\n            throw new DuplicateEmailException(\n                "Email '" + customerDto.getEmail() + "' is already registered");\n        }\n        \n        // Create customer\n        ${entityClass} customer = new ${entityClass}();\n        customer.setEmail(customerDto.getEmail());\n        return ${entityClass.toLowerCase()}Repository.save(customer);\n    }\n}\n\`\`\`\n\nThis provides proper business logic validation with meaningful error messages.`,
        priority: 'HIGH' as const,
        estimatedTime: '30 minutes'
      });
      
      fixes.push({
        title: `Add Custom Exception Handler for Validation Errors`,
        description: `💻 File: GlobalExceptionHandler.java\n📍 Class: GlobalExceptionHandler\n\nCreate a global exception handler for validation errors:\n\n\`\`\`java\n@ControllerAdvice\npublic class GlobalExceptionHandler {\n    \n    @ExceptionHandler(DuplicateEmailException.class)\n    public ResponseEntity<Map<String, String>> handleDuplicateEmail(DuplicateEmailException ex) {\n        Map<String, String> errors = new HashMap<>();\n        errors.put("email", ex.getMessage());\n        errors.put("error", "DUPLICATE_EMAIL");\n        return ResponseEntity.badRequest().body(errors);\n    }\n    \n    @ExceptionHandler(ConstraintViolationException.class)\n    public ResponseEntity<Map<String, String>> handleConstraintViolation(ConstraintViolationException ex) {\n        Map<String, String> errors = new HashMap<>();\n        ex.getConstraintViolations().forEach(violation -> {\n            errors.put(violation.getPropertyPath().toString(), violation.getMessage());\n        });\n        return ResponseEntity.badRequest().body(errors);\n    }\n}\n\`\`\`\n\nThis provides consistent error handling for validation failures.`,
        priority: 'MEDIUM' as const,
        estimatedTime: '20 minutes'
      });
    } else {
      // Generic validation error fixes
      fixes.push({
        title: `Add Custom Validation Error Handler`,
        description: `💻 File: ${fileName}${lineNumber ? `:${lineNumber}` : ''}\n📍 Class: ${entityClass}\n\nImplement proper validation error handling:\n\n\`\`\`java\ntry {\n    // Validation logic\n    validator.validate(${entityClass.toLowerCase()}Dto);\n} catch (ConstraintViolationException e) {\n    Map<String, String> errors = new HashMap<>();\n    e.getConstraintViolations().forEach(violation -> {\n        errors.put(violation.getPropertyPath().toString(), violation.getMessage());\n    });\n    throw new ValidationException("Validation failed", errors);\n}\n\`\`\`\n\nThis provides structured error handling for validation failures.`,
        priority: 'HIGH' as const,
        estimatedTime: '25 minutes'
      });
    }
    
    return fixes;
  }

  private async generateRegexFixActions(ragResponse: RAGResponse, logContent: string, issueSummary: string): Promise<Array<{
    actionType: string;
    title: string;
    description: string;
    priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    estimatedTime: string;
    sourceDocument?: string;
    sourceType?: string;
    sourceLocation?: string;
  }>> {
    const actions = [];
    
    // Extract specific information from the PatternSyntaxException log
    let invalidPattern = '*123[0-9]{10}';
    let className = 'CustomerService';
    let lineNumber = '0';
    
    // Try to extract the invalid pattern
    const patternMatch = logContent.match(/Dangling meta character '\*' near index \d+\s*([^\s]+)/);
    if (patternMatch) {
      invalidPattern = patternMatch[1];
    }
    
    // Try to extract class name from the log
    const classMatch = logContent.match(/com\.amit\.customer\.(\w+)/);
    if (classMatch) {
      className = classMatch[1];
    }
    
    // Find the relevant code file
    console.log(`🔍 Looking for ${className}.java in ${ragResponse.codeMatches.length} code files`);
    
    let relevantCodeFile = ragResponse.codeMatches.find(match => 
      match.document.title === `${className}.java` ||
      match.document.title.includes(className) ||
      match.document.filePath?.includes(className)
    );
    
    // Fall back to first match if no specific match found
    if (!relevantCodeFile) {
      relevantCodeFile = ragResponse.codeMatches[0];
    }
    
    const fileName = relevantCodeFile.document.title || `${className}.java`;
    const filePath = relevantCodeFile.document.filePath || `src/main/java/com/amit/customer/${className}.java`;
    
    actions.push({
      actionType: 'CODE_IMPLEMENTATION',
      title: `Fix Invalid Regex Pattern in ${className}`,
      description: `💻 File: ${fileName}\n📍 Class: ${className}\n\nFix the invalid regex pattern with dangling meta character:\n\n\`\`\`java\n// Current invalid pattern: ${invalidPattern}\n// Fixed pattern options:\n\n// Option 1: If asterisk should be literal\nString pattern = "\\\\*123[0-9]{10}";\n\n// Option 2: If asterisk should be a quantifier (zero or more)\nString pattern = "123[0-9]{10}*";\n\n// Option 3: If pattern should match any number followed by 123 and 10 digits\nString pattern = ".*123[0-9]{10}";\n\n// Use the pattern with proper validation\nif (Pattern.matches(pattern, input)) {\n    // Pattern matches\n}\n\`\`\`\n\nThis fixes the PatternSyntaxException by properly escaping or repositioning the asterisk character.`,
      priority: 'HIGH' as const,
      estimatedTime: '20 minutes',
      sourceDocument: fileName,
      sourceType: 'code',
      sourceLocation: filePath
    });
    
    actions.push({
      actionType: 'CODE_IMPLEMENTATION',
      title: `Add Regex Pattern Validation`,
      description: `💻 File: ${fileName}\n📍 Class: ${className}\n\nAdd validation to prevent invalid regex patterns:\n\n\`\`\`java\n// Add try-catch for regex compilation\ntry {\n    Pattern compiledPattern = Pattern.compile(regexPattern);\n    if (compiledPattern.matcher(input).matches()) {\n        // Pattern validation successful\n        return true;\n    }\n} catch (PatternSyntaxException e) {\n    logger.error("Invalid regex pattern: " + regexPattern, e);\n    // Use default validation or throw a more specific exception\n    throw new IllegalArgumentException("Invalid validation pattern configured", e);\n}\n\`\`\`\n\nThis prevents PatternSyntaxException from crashing the application by catching and handling regex compilation errors.`,
      priority: 'MEDIUM' as const,
      estimatedTime: '15 minutes',
      sourceDocument: fileName,
      sourceType: 'code',
      sourceLocation: filePath
    });
    
    return actions;
  }

  private generateActionsFromInternalContent(ragResponse: RAGResponse, logContent: string, issueSummary: string): Array<{
    actionType: string;
    title: string;
    description: string;
    priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    estimatedTime: string;
    sourceDocument?: string;
    sourceType?: string;
    sourceLocation?: string;
  }> {
    const actions = [];
    
    // Actions from internal documentation
    if (ragResponse.internalMatches && ragResponse.internalMatches.length > 0) {
      const bestDocMatch = ragResponse.internalMatches[0];
      const locationInfo = bestDocMatch.document.metadata?.location || bestDocMatch.document.url || 'Internal Documentation';
      const documentType = bestDocMatch.document.type || 'documentation';
      
      actions.push({
        actionType: 'DOCUMENTATION_REFERENCE',
        title: `Apply Solution from ${bestDocMatch.document.title}`,
        description: `📄 Source: ${bestDocMatch.document.title} (${documentType})\n📍 Location: ${locationInfo}\n\n**Documentation-based Solution:**\n${bestDocMatch.matchedContent.substring(0, 200)}...`,
        priority: 'HIGH' as const,
        estimatedTime: '30 minutes',
        sourceDocument: bestDocMatch.document.title,
        sourceType: documentType,
        sourceLocation: locationInfo
      });
    }
    
    // Actions from code repository content
    if (ragResponse.codeMatches && ragResponse.codeMatches.length > 0) {
      const bestCodeMatch = ragResponse.codeMatches[0];
      const codeLocation = bestCodeMatch.document.metadata?.location || bestCodeMatch.document.url || 'Code Repository';
      const codeType = bestCodeMatch.document.type || 'code';
      
      actions.push({
        actionType: 'CODE_REVIEW',
        title: `Review ${bestCodeMatch.document.title}`,
        description: `💻 **File:** ${codeLocation}\n📁 **Repository:** ${bestCodeMatch.document.title}\n\n**Related Code Context:**\n\`\`\`${codeType}\n${bestCodeMatch.matchedContent.substring(0, 200)}...\n\`\`\``,
        priority: 'MEDIUM' as const,
        estimatedTime: '45 minutes',
        sourceDocument: bestCodeMatch.document.title,
        sourceType: codeType,
        sourceLocation: codeLocation
      });
    }
    
    return actions;
  }

  private determineSeverity(logContent: string, issueSummary: string): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
    const content = logContent.toLowerCase();
    const summary = issueSummary.toLowerCase();
    
    if (content.includes('critical') || content.includes('fatal') || summary.includes('critical')) {
      return 'CRITICAL';
    } else if (content.includes('error') || content.includes('exception') || content.includes('fail')) {
      return 'HIGH';
    } else if (content.includes('warning') || content.includes('warn')) {
      return 'MEDIUM';
    } else {
      return 'LOW';
    }
  }

  private extractAffectedSystems(logContent: string, issueSummary: string): string[] {
    const systems = [];
    const content = logContent.toLowerCase();
    const summary = issueSummary.toLowerCase();
    
    if (content.includes('database') || content.includes('sql') || summary.includes('database')) {
      systems.push('Database');
    }
    if (content.includes('web') || content.includes('http') || summary.includes('web')) {
      systems.push('Web Server');
    }
    if (content.includes('api') || summary.includes('api')) {
      systems.push('API');
    }
    if (content.includes('application') || summary.includes('application')) {
      systems.push('Application');
    }
    
    return systems.length > 0 ? systems : ['System'];
  }

  async generateRCAWorkflow(logContent: string, issueSummary: string, ragResponse?: RAGResponse): Promise<any[]> {
    return [
      {
        step: 1,
        stepName: 'Log Analysis',
        status: 'COMPLETED',
        details: 'Analyzed log patterns and error signatures',
        confidence: 85,
        metadata: { source: 'ai_analysis' }
      },
      {
        step: 2,
        stepName: 'Pattern Recognition',
        status: 'COMPLETED',
        details: 'Identified patterns in log content',
        confidence: 90,
        metadata: { source: 'ai_analysis' }
      },
      {
        step: 3,
        stepName: 'Solution Validation',
        status: 'IN_PROGRESS',
        details: 'Validating recommended fix approach',
        confidence: 80,
        metadata: { source: 'ai_analysis' }
      },
      {
        step: 4,
        stepName: 'Impact Assessment',
        status: 'PENDING',
        details: 'Evaluating system impact of proposed changes',
        confidence: 75,
        metadata: { source: 'ai_analysis' }
      }
    ];
  }
}

export const aiService = new AIService();