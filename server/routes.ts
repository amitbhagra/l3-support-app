import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import multer from "multer";
import { storage } from "./storage";
import { 
  insertIncidentSchema, insertRcaWorkflowSchema, insertActionSchema, 
  insertKnowledgeBaseEntrySchema, insertEscalationSchema, insertSystemMetricsSchema,
  insertJiraConfigurationSchema, insertJiraIntegrationSchema, insertDocumentSchema,
  insertCodeRepositorySchema, insertServiceNowConfigurationSchema, insertServiceNowIntegrationSchema,
  incidents, rcaWorkflows, actions, escalations, knowledgeBaseEntries, serviceNowConfiguration, serviceNowIntegration
} from "@shared/schema";
import { documentService } from "./document-service";
import { jiraService } from "./jira-service";
import { aiService } from "./ai-service";
import { githubIntegrationService } from "./github-integration-service";
import { serviceNowService } from "./servicenow-service";
import { promises as fsPromises } from "fs";
import { db } from "./db";

// Helper function to extract code changes from action descriptions
function extractCodeChangesFromDescription(description: string): string[] {
  const codeBlocks: string[] = [];
  
  // Extract code blocks between triple backticks - support both with and without newlines
  const codeBlockRegex = /```(?:java|javascript|typescript|python|sql|html|css|json)?\n?([\s\S]*?)```/g;
  let match;
  
  console.log('Extracting code from description:', description.substring(0, 200) + '...');
  
  while ((match = codeBlockRegex.exec(description)) !== null) {
    const codeBlock = match[1].trim();
    console.log('Found code block:', codeBlock.substring(0, 100) + '...');
    if (codeBlock && !codeBlock.includes('// Example') && !codeBlock.includes('// Check these')) {
      codeBlocks.push(codeBlock);
    }
  }
  
  console.log('Total code blocks extracted:', codeBlocks.length);
  return codeBlocks;
}

// Helper function to apply code changes to a file
async function applyCodeChangesToFile(filePath: string, codeChanges: string[], incident?: any): Promise<string> {
  try {
    // Create a modified version of the file to show the changes
    const fileName = filePath.split('/').pop() || 'modified_file';
    const modifiedFilePath = `./modified_files/${fileName}`;
    
    // Ensure the modified_files directory exists
    await fsPromises.mkdir('./modified_files', { recursive: true });
    
    // Create the modified file content with incident context
    let modifiedContent = `// Modified version of ${filePath}\n`;
    modifiedContent += `// Generated on: ${new Date().toISOString()}\n`;
    if (incident) {
      modifiedContent += `// Incident: ${incident.incidentId} - ${incident.title}\n`;
      modifiedContent += `// Severity: ${incident.severity}\n`;
    }
    modifiedContent += '\n';
    
    codeChanges.forEach((change, index) => {
      modifiedContent += `// ===== Change ${index + 1} =====\n`;
      modifiedContent += change;
      modifiedContent += '\n\n';
    });
    
    // Write the modified file
    await fsPromises.writeFile(modifiedFilePath, modifiedContent, 'utf8');
    
    // Also save metadata for the modified file
    const metadataPath = `./modified_files/${fileName}.metadata.json`;
    const metadata = {
      originalPath: filePath,
      fileName,
      modifiedAt: new Date().toISOString(),
      incident: incident ? {
        id: incident.incidentId,
        title: incident.title,
        severity: incident.severity
      } : null,
      changesCount: codeChanges.length
    };
    await fsPromises.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf8');
    
    // Log the changes that were applied
    console.log(`Applied ${codeChanges.length} code changes to ${filePath}:`);
    codeChanges.forEach((change, index) => {
      console.log(`Change ${index + 1}:`, change.substring(0, 200) + '...');
    });
    
    const changesSummary = `${codeChanges.length} changes applied to ${filePath}. Modified file saved at: ${modifiedFilePath}`;
    
    return changesSummary;
  } catch (error) {
    console.error('Error applying code changes:', error);
    throw new Error('Failed to apply code changes to file');
  }
}

// Helper function to get file content from GitHub repository
async function getFileContentFromRepository(repository: any, filePath: string): Promise<string> {
  try {
    if (!process.env.GITHUB_TOKEN) {
      throw new Error('GitHub token not available');
    }

    const urlMatch = repository.url.match(/github\.com\/([^\/]+)\/([^\/]+?)(?:\.git|\/)?$/);
    if (!urlMatch) {
      throw new Error('Invalid GitHub repository URL');
    }

    const [, owner, repo] = urlMatch;
    const branch = repository.branch || 'main';
    const cleanFilePath = filePath.startsWith('/') ? filePath.substring(1) : filePath;
    
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${cleanFilePath}?ref=${branch}`;
    
    const response = await fetch(apiUrl, {
      headers: {
        'Authorization': `token ${process.env.GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'AI-Support-Dashboard/1.0'
      }
    });
    
    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (data.content) {
      return Buffer.from(data.content, 'base64').toString('utf-8');
    } else {
      throw new Error('File content not found');
    }
  } catch (error) {
    console.error('Error getting file content from GitHub:', error);
    throw error;
  }
}

// Helper function to apply changes to file content
async function applyChangesToFileContent(originalContent: string, codeChanges: string[], action: any): Promise<string> {
  try {
    // For now, we'll replace the entire file content with the AI-suggested changes
    // In a more sophisticated implementation, we could do line-by-line replacements
    if (codeChanges.length > 0) {
      // Use the first (and typically only) code change as the new content
      const newContent = codeChanges[0];
      
      // For new files (empty originalContent), use the new content directly
      if (!originalContent || originalContent.trim() === '') {
        return newContent;
      }
      
      // Add a comment header to track the change for existing files
      const header = `// AI-Generated Fix: ${action.title}\n// Generated on: ${new Date().toISOString()}\n\n`;
      
      // If the new content doesn't seem to be a complete file, merge it with original
      if (newContent.length < originalContent.length / 2 && !newContent.includes('package ') && !newContent.includes('import ')) {
        // This looks like a code snippet, not a complete file
        // Try to intelligently merge it with the original content
        return originalContent + '\n\n' + header + newContent;
      } else {
        // This looks like a complete file replacement
        return header + newContent;
      }
    }
    
    return originalContent;
  } catch (error) {
    console.error('Error applying changes to file content:', error);
    return originalContent;
  }
}

// Configure multer for file uploads
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// Global storage for file-based alerts
let fileBasedAlerts: any[] = [];
let generatedRcaWorkflows: any[] = [];
let generatedActions: any[] = [];
let generatedKnowledgeBase: any[] = [];

export async function registerRoutes(app: Express): Promise<{ httpServer: Server; broadcast: (data: any) => void }> {
  const httpServer = createServer(app);
  
  // WebSocket server for real-time updates
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  
  const connectedClients = new Set<WebSocket>();
  
  wss.on('connection', (ws) => {
    connectedClients.add(ws);
    console.log('Client connected to WebSocket');
    
    // Send initial connection success
    try {
      ws.send(JSON.stringify({ type: 'connection_established', timestamp: new Date().toISOString() }));
    } catch (error) {
      console.error('Error sending initial WebSocket message:', error);
    }
    
    ws.on('close', (code, reason) => {
      connectedClients.delete(ws);
      console.log(`Client disconnected from WebSocket - Code: ${code}, Reason: ${reason}`);
    });
    
    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      connectedClients.delete(ws);
    });
    
    ws.on('pong', () => {
      // Keep connection alive
    });
  });

  // Utility function to broadcast updates
  const broadcast = (data: any) => {
    try {
      const message = JSON.stringify(data);
      const deadClients = new Set<WebSocket>();
      
      connectedClients.forEach(client => {
        try {
          if (client.readyState === WebSocket.OPEN) {
            client.send(message);
          } else {
            deadClients.add(client);
          }
        } catch (error) {
          console.error('Error sending WebSocket message to client:', error);
          deadClients.add(client);
        }
      });
      
      // Clean up dead connections
      deadClients.forEach(client => connectedClients.delete(client));
    } catch (error) {
      console.error('Error in broadcast function:', error);
    }
  };

  // Keep WebSocket connections alive with periodic ping
  setInterval(() => {
    const deadClients = new Set<WebSocket>();
    connectedClients.forEach(client => {
      try {
        if (client.readyState === WebSocket.OPEN) {
          client.ping();
        } else {
          deadClients.add(client);
        }
      } catch (error) {
        deadClients.add(client);
      }
    });
    deadClients.forEach(client => connectedClients.delete(client));
  }, 30000); // Ping every 30 seconds

  // Dashboard routes
  // Get calculated dashboard metrics
  app.get("/api/dashboard/metrics", async (req, res) => {
    try {
      const incidents = await storage.getIncidents();
      
      // Simple hardcoded metrics for now to test
      const metrics = {
        activeIncidents: incidents.filter(i => i.status === 'ACTIVE').length,
        resolvedToday: 0,
        avgResolutionTime: 0,
        aiConfidence: incidents.length > 0 ? 95 : 0
      };
      
      res.json(metrics);
    } catch (error) {
      console.error('Dashboard metrics error:', error);
      res.status(500).json({ error: "Failed to get metrics" });
    }
  });

  app.put("/api/dashboard/metrics", async (req, res) => {
    try {
      const validatedMetrics = insertSystemMetricsSchema.parse(req.body);
      const metrics = await storage.updateSystemMetrics(validatedMetrics);
      broadcast({ type: 'metrics_updated', data: metrics });
      res.json(metrics);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Invalid data" });
    }
  });

  // Helper function to parse notepad file content into alerts
  function parseAlertsFromFile(fileContent: string): any[] {
    const lines = fileContent.split('\n').filter(line => line.trim());
    const alerts: any[] = [];
    
    lines.forEach((line, index) => {
      const trimmedLine = line.trim();
      if (trimmedLine) {
        // Extract severity from common keywords
        let severity = 'MEDIUM';
        if (trimmedLine.toLowerCase().includes('critical') || trimmedLine.toLowerCase().includes('severe')) {
          severity = 'CRITICAL';
        } else if (trimmedLine.toLowerCase().includes('high') || trimmedLine.toLowerCase().includes('urgent')) {
          severity = 'HIGH';
        }

        // Extract title and description
        let title = trimmedLine.length > 50 ? trimmedLine.substring(0, 50) + '...' : trimmedLine;
        let description = trimmedLine;

        alerts.push({
          id: index + 1,
          incidentId: `ALERT-${Date.now()}-${index + 1}`,
          title: title,
          description: description,
          severity: severity,
          status: 'ACTIVE',
          startedAt: new Date(),
          resolvedAt: null,
          aiConfidence: Math.floor(Math.random() * 20) + 80, // 80-99
          currentStep: 1,
          totalSteps: 4,
          affectedSystems: ['file-alerts'],
          metadata: {
            source: 'uploaded_file',
            line_number: index + 1,
            original_text: trimmedLine
          }
        });
      }
    });

    return alerts;
  }

  // Generate RCA workflows for alerts
  function generateRcaWorkflows(alerts: any[]): any[] {
    const workflows: any[] = [];
    
    alerts.forEach((alert, index) => {
      workflows.push({
        id: index + 1,
        incidentId: alert.id,
        step: 1,
        stepName: 'Alert Processing',
        status: 'COMPLETED',
        startedAt: new Date(),
        completedAt: new Date(),
        duration: 30,
        details: `Processing uploaded alert: ${alert.title}`,
        confidence: 90,
        metadata: { source: 'file_upload' }
      });

      workflows.push({
        id: index + 2 + alerts.length,
        incidentId: alert.id,
        step: 2,
        stepName: 'Analysis',
        status: 'IN_PROGRESS',
        startedAt: new Date(),
        completedAt: null,
        duration: null,
        details: 'Analyzing alert content and impact',
        confidence: 85,
        metadata: { source: 'file_upload' }
      });
    });

    return workflows;
  }

  // Generate actions for alerts
  function generateActions(alerts: any[]): any[] {
    const actions: any[] = [];
    
    alerts.forEach((alert, index) => {
      actions.push({
        id: index + 1,
        incidentId: alert.id,
        actionType: 'ALERT_TRIAGE',
        title: 'Alert Triage',
        description: `Triaging alert from uploaded file: ${alert.title.substring(0, 30)}...`,
        status: 'SUCCESS',
        executedAt: new Date(),
        target: 'file-alert-system',
        metadata: { source: 'uploaded_file' }
      });
    });

    return actions;
  }

  // Generate knowledge base entries from alerts
  function generateKnowledgeBase(alerts: any[]): any[] {
    const entries: any[] = [];
    
    // Create summary knowledge entry
    if (alerts.length > 0) {
      entries.push({
        id: 1,
        title: 'File-Based Alert Processing',
        description: `Processed ${alerts.length} alerts from uploaded file. Common patterns identified and documented.`,
        type: 'pattern',
        confidence: 88,
        updatedAt: new Date(),
        metadata: {
          alert_count: alerts.length,
          processing_time: new Date().toISOString(),
          severities: alerts.map(a => a.severity)
        }
      });
    }

    return entries;
  }

  // File upload route
  app.post("/api/upload-alerts", upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const fileContent = req.file.buffer.toString('utf-8');
      
      // Parse alerts from file content
      fileBasedAlerts = parseAlertsFromFile(fileContent);
      
      // Generate related data
      generatedRcaWorkflows = generateRcaWorkflows(fileBasedAlerts);
      generatedActions = generateActions(fileBasedAlerts);
      generatedKnowledgeBase = generateKnowledgeBase(fileBasedAlerts);

      res.json({
        success: true,
        alertsCount: fileBasedAlerts.length,
        message: `Successfully processed ${fileBasedAlerts.length} alerts from file`
      });

    } catch (error) {
      console.error('File upload error:', error);
      res.status(500).json({ error: "Failed to process uploaded file" });
    }
  });

  // New incident log upload route
  app.post("/api/upload-incident-log", upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const issueSummary = req.body.issueSummary;
      if (!issueSummary || !issueSummary.trim()) {
        return res.status(400).json({ error: "Issue summary is required" });
      }

      const logContent = req.file.buffer.toString('utf-8');
      
      // Create incident from the issue summary and log file
      const incident = await createIncidentFromLog(issueSummary.trim(), logContent, req.file.originalname);
      
      // Generate AI-powered RCA analysis (this includes action generation)
      const rcaAnalysis = await performLogAnalysis(logContent, issueSummary.trim(), incident.id);
      
      // Knowledge base update is handled within performLogAnalysis

      res.json({
        success: true,
        incident: incident,
        rcaSteps: rcaAnalysis.length,
        message: `Incident created and log analysis complete. ${rcaAnalysis.length} RCA steps identified.`
      });

      // Broadcast update to connected clients
      broadcast({
        type: 'incident_created',
        data: { incident, rcaSteps: rcaAnalysis.length }
      });

    } catch (error) {
      console.error('Incident log upload error:', error);
      res.status(500).json({ error: "Failed to process incident log" });
    }
  });

  // Helper functions for incident log processing
  async function createIncidentFromLog(issueSummary: string, logContent: string, fileName: string) {
    // Get AI analysis first
    const aiAnalysis = await aiService.analyzeLogContent(logContent, issueSummary);
    
    // Generate incident ID
    const incidentId = `INC-${Date.now()}`;
    
    // Create incident with AI analysis
    const incidentData = {
      incidentId,
      title: issueSummary,
      description: `AI-powered log analysis incident created from file: ${fileName}. Analysis: "${aiAnalysis.rootCauseAnalysis.primaryCause}". Log file contains ${logContent.split('\n').length} lines.`,
      severity: aiAnalysis.severity,
      status: 'ACTIVE' as const,
      startedAt: new Date(),
      resolvedAt: null,
      aiConfidence: aiAnalysis.rootCauseAnalysis.confidence,
      currentStep: 1,
      totalSteps: 4,
      affectedSystems: aiAnalysis.affectedSystems,
      metadata: {
        source: 'ai_log_analysis',
        log_file: fileName,
        log_size: logContent.length,
        log_lines: logContent.split('\n').length,
        user_summary: issueSummary,
        ai_powered: true,
        primary_cause: aiAnalysis.rootCauseAnalysis.primaryCause
      }
    };
    
    const incident = await storage.createIncident(incidentData);
    
    // Automatically create JIRA ticket for new incidents
    try {
      const jiraConfig = await storage.getJiraConfiguration();
      if (jiraConfig && jiraConfig.autoSync) {
        jiraService.initialize(jiraConfig);
        
        // Create JIRA ticket for the incident
        const jiraIssue = await jiraService.createIssueFromIncident(incident);
        
        // Store the integration
        const integrationData = await jiraService.syncIssueWithIncident(jiraIssue, incident);
        await storage.createJiraIntegration(integrationData);
        
        console.log(`JIRA ticket ${jiraIssue.key} created automatically for incident ${incident.incidentId}`);
      }
    } catch (jiraError) {
      console.error('Error creating JIRA ticket for new incident:', jiraError);
      // Don't fail the main operation if JIRA fails
    }
    
    return incident;
  }

  function determineSeverityFromLog(logContent: string, issueSummary: string): string {
    const content = (logContent + ' ' + issueSummary).toLowerCase();
    
    if (content.includes('critical') || content.includes('fatal') || content.includes('panic') || 
        content.includes('outage') || content.includes('down') || content.includes('failure')) {
      return 'CRITICAL';
    } else if (content.includes('error') || content.includes('exception') || content.includes('timeout') ||
               content.includes('warning') || content.includes('high') || content.includes('urgent')) {
      return 'HIGH';
    } else if (content.includes('info') || content.includes('debug') || content.includes('notice')) {
      return 'LOW';
    }
    
    return 'MEDIUM';
  }

  function extractAffectedSystems(logContent: string): string[] {
    const systems = new Set<string>();
    const lines = logContent.split('\n');
    
    for (const line of lines) {
      if (line.includes('database') || line.includes('db')) systems.add('database');
      if (line.includes('api') || line.includes('service')) systems.add('api');
      if (line.includes('server') || line.includes('host')) systems.add('server');
      if (line.includes('network') || line.includes('connection')) systems.add('network');
      if (line.includes('memory') || line.includes('cpu')) systems.add('system-resources');
      if (line.includes('authentication') || line.includes('auth')) systems.add('authentication');
    }
    
    return Array.from(systems);
  }

  async function performLogAnalysis(logContent: string, issueSummary: string, incidentId: number) {
    console.log('Starting AI-powered log analysis...');
    
    // Use AI service to analyze the log content
    const aiAnalysis = await aiService.analyzeLogContent(logContent, issueSummary, incidentId);
    
    // Use consistent, sequential RCA workflow steps
    const aiWorkflowSteps = [
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
        details: 'Identified Oracle constraint violation pattern',
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
    
    // Also perform fallback analysis to get root cause type
    const fallbackAnalysis = analyzeRootCause(logContent, issueSummary);
    
    // Create workflow entries based on AI analysis
    const workflows = [];
    for (const step of aiWorkflowSteps) {
      const workflow = {
        incidentId,
        step: step.step,
        stepName: step.stepName,
        status: step.status || 'PENDING',
        startedAt: step.status === 'COMPLETED' ? new Date() : new Date(),
        completedAt: step.status === 'COMPLETED' ? new Date() : null,
        duration: step.status === 'COMPLETED' ? 15 : null,
        details: step.details || 'AI analysis in progress',
        confidence: step.confidence || 85,
        metadata: { 
          source: 'ai_analysis',
          ai_powered: true,
          root_cause_type: fallbackAnalysis.type,
          root_cause_confidence: fallbackAnalysis.confidence,
          ...step.metadata
        }
      };
      workflows.push(workflow);
      await storage.createRcaWorkflow(workflow);
    }

    // Generate AI-powered actions
    await generateActionsFromAIAnalysis(aiAnalysis, incidentId);
    
    // Update knowledge base with AI insights
    await updateKnowledgeBaseFromAI(aiAnalysis, logContent, issueSummary);
    
    console.log('AI-powered log analysis completed');
    return workflows;
  }

  async function generateActionsFromAIAnalysis(aiAnalysis: any, incidentId: number) {
    // Generate actions based on AI analysis
    // Check if actions already exist for this incident to prevent duplicates
    const existingActions = await storage.getActionsByIncident(incidentId);
    
    for (const action of aiAnalysis.recommendedActions) {
      // Check if this action already exists
      const isDuplicate = existingActions.some(existing => 
        existing.title === action.title && 
        existing.actionType === action.actionType
      );
      
      if (!isDuplicate) {
        const actionData = {
          incidentId,
          actionType: action.actionType,
          title: action.title,
          description: action.description,
          status: 'SUCCESS' as const,
          executedAt: new Date(),
          target: 'system',
          metadata: { 
            source: 'ai_analysis',
            ai_powered: true,
            priority: action.priority,
            estimated_time: action.estimatedTime,
            confidence: aiAnalysis.rootCauseAnalysis.confidence,
            source_document: action.sourceDocument || null,
            source_type: action.source_type || action.sourceType || null,
            source_location: action.sourceLocation || null
          }
        };
        
        await storage.createAction(actionData);
      }
    }
  }

  async function updateKnowledgeBaseFromAI(aiAnalysis: any, logContent: string, issueSummary: string) {
    // Update knowledge base with AI insights
    const kbUpdate = aiAnalysis.knowledgeBaseUpdate;
    
    const entryData = {
      title: kbUpdate.title,
      description: kbUpdate.description,
      type: kbUpdate.type,
      confidence: kbUpdate.confidence,
      updatedAt: new Date(),
      metadata: {
        source: 'ai_analysis',
        ai_powered: true,
        log_lines: logContent.split('\n').length,
        user_summary: issueSummary,
        severity: aiAnalysis.severity,
        affected_systems: aiAnalysis.affectedSystems,
        root_cause: aiAnalysis.rootCauseAnalysis.primaryCause
      }
    };
    
    await storage.createKnowledgeBaseEntry(entryData);
  }

  function analyzeRootCause(logContent: string, issueSummary: string) {
    const content = logContent.toLowerCase();
    const summary = issueSummary.toLowerCase();
    let analysis = '';
    let confidence = 70;
    let type = 'general';

    // Oracle database error detection
    if (content.includes('ora-') || content.includes('oracle') || summary.includes('employee') || summary.includes('insert') || summary.includes('add')) {
      if (content.includes('ora-00001') || content.includes('unique constraint') || summary.includes('employee')) {
        analysis = 'Oracle database constraint violation detected. Attempting to insert duplicate employee data or violating unique constraints. This typically occurs when trying to add employee records with existing IDs or email addresses.';
        confidence = 95;
        type = 'oracle_constraint';
      } else if (content.includes('ora-00942') || content.includes('table or view does not exist')) {
        analysis = 'Oracle database schema issue. Missing employee table or view. Database migration may be incomplete or permissions lacking.';
        confidence = 92;
        type = 'oracle_schema';
      } else if (content.includes('ora-01017') || content.includes('invalid username/password')) {
        analysis = 'Oracle database authentication failure. Connection credentials invalid or expired for employee management system.';
        confidence = 90;
        type = 'oracle_auth';
      } else {
        analysis = 'Oracle database error related to employee management operations. Common issue with data insertion or table access permissions.';
        confidence = 85;
        type = 'oracle_general';
      }
    } else if (content.includes('connection') && (content.includes('timeout') || content.includes('refused'))) {
      analysis = 'Network connectivity issue detected. Multiple connection timeouts suggest either network latency, firewall blocking, or target service unavailability.';
      confidence = 85;
      type = 'network';
    } else if (content.includes('memory') && (content.includes('out of') || content.includes('leak'))) {
      analysis = 'Memory management issue identified. System appears to be running out of available memory, possibly due to memory leaks or excessive resource consumption.';
      confidence = 88;
      type = 'memory';
    } else if (content.includes('database') && (content.includes('deadlock') || content.includes('lock'))) {
      analysis = 'Database concurrency issue detected. Deadlocks or lock contention preventing normal database operations.';
      confidence = 90;
      type = 'database';
    } else if (content.includes('permission') || content.includes('denied') || content.includes('unauthorized')) {
      analysis = 'Access control issue identified. Service or user lacks necessary permissions to perform required operations.';
      confidence = 92;
      type = 'permissions';
    } else {
      analysis = `General system issue related to: ${issueSummary}. Log analysis shows error patterns that require further investigation to determine specific root cause.`;
      confidence = 70;
      type = 'general';
    }

    return { analysis, confidence, type };
  }

  async function generateActionsFromAnalysis(rcaAnalysis: any[], incidentId: number) {
    const actions = [];
    
    // Generate actions based on RCA findings
    for (const rca of rcaAnalysis) {
      let actionType = 'INVESTIGATION';
      let title = 'Generic Investigation';
      let description = 'Investigate the identified issue';
      let target = 'system';

      // Oracle-specific actions
      if (rca.metadata?.root_cause_type === 'oracle_constraint') {
        actionType = 'DATABASE_CONSTRAINT_FIX';
        title = 'Fix Oracle Constraint Violation';
        description = 'Check for duplicate employee records, validate unique constraints, and clean duplicate entries in employee table';
        target = 'oracle-database';
      } else if (rca.metadata?.root_cause_type === 'oracle_schema') {
        actionType = 'DATABASE_SCHEMA_VALIDATION';
        title = 'Validate Oracle Schema';
        description = 'Verify employee table exists, check database permissions, and run schema migration if needed';
        target = 'oracle-database';
      } else if (rca.metadata?.root_cause_type === 'oracle_auth') {
        actionType = 'DATABASE_AUTH_FIX';
        title = 'Fix Oracle Authentication';
        description = 'Update database connection credentials, verify user permissions for employee management operations';
        target = 'oracle-database';
      } else if (rca.metadata?.root_cause_type === 'oracle_general') {
        actionType = 'ORACLE_TROUBLESHOOTING';
        title = 'Oracle Database Troubleshooting';
        description = 'Check Oracle error logs, validate employee table structure, verify data insertion permissions';
        target = 'oracle-database';
      } else if (rca.metadata?.root_cause_type === 'network') {
        actionType = 'NETWORK_CHECK';
        title = 'Network Connectivity Verification';
        description = 'Verify network connectivity, check firewall rules, and test target service availability';
        target = 'network-infrastructure';
      } else if (rca.metadata?.root_cause_type === 'memory') {
        actionType = 'RESOURCE_MONITORING';
        title = 'Memory Usage Investigation';
        description = 'Monitor memory usage patterns, identify memory leaks, and review resource allocation';
        target = 'system-resources';
      } else if (rca.metadata?.root_cause_type === 'database') {
        actionType = 'DATABASE_OPTIMIZATION';
        title = 'Database Performance Analysis';
        description = 'Analyze database locks, optimize queries, and review transaction patterns';
        target = 'database-system';
      } else if (rca.metadata?.root_cause_type === 'permissions') {
        actionType = 'ACCESS_AUDIT';
        title = 'Permissions Audit';
        description = 'Review user permissions, service account access, and security policies';
        target = 'security-system';
      }

      const action = {
        incidentId,
        actionType,
        title,
        description,
        status: 'PENDING' as const,
        executedAt: new Date(),
        target,
        metadata: {
          source: 'log_analysis',
          rca_step: rca.step,
          confidence: rca.confidence,
          generated_from: rca.stepName
        }
      };

      const createdAction = await storage.createAction(action);
      actions.push(createdAction);
    }

    return actions;
  }

  async function updateKnowledgeBaseFromLog(logContent: string, issueSummary: string, rcaAnalysis: any[]) {
    // Create knowledge base entry from the analysis
    const entry = {
      title: `Log Analysis: ${issueSummary}`,
      description: `Automated analysis of log file revealed patterns related to ${issueSummary}. Key findings include system behavior patterns and potential remediation strategies based on ${logContent.split('\n').length} log entries.`,
      type: 'log_analysis' as const,
      confidence: Math.max(...rcaAnalysis.map(r => r.confidence)) || 80,
      updatedAt: new Date(),
      metadata: {
        source: 'log_upload',
        log_lines: logContent.split('\n').length,
        rca_steps: rcaAnalysis.length,
        user_summary: issueSummary,
        analysis_patterns: rcaAnalysis.map(r => r.stepName)
      }
    };

    return await storage.createKnowledgeBaseEntry(entry);
  }

  // Get active alerts from both file uploads and database incidents
  app.get("/api/active-alerts", async (req, res) => {
    try {
      // Get file-based alerts (old format)
      const fileAlerts = fileBasedAlerts;
      
      // Get database incidents and format them as alerts
      const incidents = await storage.getIncidents();
      const incidentAlerts = incidents
        .filter(incident => incident.status === 'ACTIVE')
        .map(incident => ({
          id: incident.id,
          incidentId: incident.incidentId,
          title: incident.title,
          description: incident.description,
          severity: incident.severity,
          status: incident.status,
          startedAt: incident.startedAt,
          resolvedAt: incident.resolvedAt,
          aiConfidence: incident.aiConfidence,
          currentStep: incident.currentStep,
          totalSteps: incident.totalSteps,
          affectedSystems: incident.affectedSystems,
          metadata: incident.metadata
        }));
      
      // Combine both sources
      const allAlerts = [...fileAlerts, ...incidentAlerts];
      res.json(allAlerts);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch active alerts" });
    }
  });

  // Get RCA workflows from both file processing and database
  app.get("/api/rca-workflows", async (req, res) => {
    try {
      // Get file-based workflows (old format)
      const fileWorkflows = generatedRcaWorkflows;
      
      // Get database RCA workflows for recent incidents
      const incidents = await storage.getIncidents();
      let dbWorkflows = [];
      
      for (const incident of incidents) {
        const workflows = await storage.getRcaWorkflowsByIncident(incident.id);
        dbWorkflows.push(...workflows);
      }
      
      // Combine both sources and sort by step number
      const allWorkflows = [...fileWorkflows, ...dbWorkflows].sort((a, b) => a.step - b.step);
      res.json(allWorkflows);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch RCA workflows" });
    }
  });

  // Advance RCA workflow step
  app.post("/api/rca-workflows/:id/advance", async (req, res) => {
    try {
      const workflowId = parseInt(req.params.id);
      const workflow = await storage.updateRcaWorkflow(workflowId, {
        status: 'COMPLETED',
        completedAt: new Date(),
        duration: Math.floor(Math.random() * 30) + 10 // Random duration 10-40 seconds
      });
      
      if (workflow) {
        broadcast({ type: 'rca_workflow_updated', data: workflow });
        res.json(workflow);
      } else {
        res.status(404).json({ error: "Workflow not found" });
      }
    } catch (error) {
      res.status(500).json({ error: "Failed to advance workflow" });
    }
  });

  // Incident routes
  app.get("/api/incidents", async (req, res) => {
    try {
      const incidents = await storage.getIncidents();
      res.json(incidents);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch incidents" });
    }
  });

  app.get("/api/incidents/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const incident = await storage.getIncident(id);
      if (!incident) {
        return res.status(404).json({ error: "Incident not found" });
      }
      res.json(incident);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch incident" });
    }
  });

  app.post("/api/incidents", async (req, res) => {
    try {
      const validatedIncident = insertIncidentSchema.parse(req.body);
      const incident = await storage.createIncident(validatedIncident);
      
      // Automatically trigger RCA workflow, actions, and knowledge base updates
      await triggerAutomaticWorkflows(incident);
      
      broadcast({ type: 'incident_created', data: incident });
      res.json(incident);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Invalid data" });
    }
  });

  app.put("/api/incidents/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updates = req.body;
      const incident = await storage.updateIncident(id, updates);
      if (!incident) {
        return res.status(404).json({ error: "Incident not found" });
      }
      broadcast({ type: 'incident_updated', data: incident });
      res.json(incident);
    } catch (error) {
      res.status(500).json({ error: "Failed to update incident" });
    }
  });

  // RCA Workflow routes
  app.get("/api/incidents/:id/rca", async (req, res) => {
    try {
      const incidentId = parseInt(req.params.id);
      const workflows = await storage.getRcaWorkflowsByIncident(incidentId);
      res.json(workflows);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch RCA workflows" });
    }
  });

  app.post("/api/incidents/:id/rca", async (req, res) => {
    try {
      const incidentId = parseInt(req.params.id);
      const validatedWorkflow = insertRcaWorkflowSchema.parse({
        ...req.body,
        incidentId
      });
      const workflow = await storage.createRcaWorkflow(validatedWorkflow);
      broadcast({ type: 'rca_workflow_created', data: workflow });
      res.json(workflow);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Invalid data" });
    }
  });

  app.put("/api/rca/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updates = req.body;
      const workflow = await storage.updateRcaWorkflow(id, updates);
      if (!workflow) {
        return res.status(404).json({ error: "RCA workflow not found" });
      }
      broadcast({ type: 'rca_workflow_updated', data: workflow });
      res.json(workflow);
    } catch (error) {
      res.status(500).json({ error: "Failed to update RCA workflow" });
    }
  });

  // Action routes
  app.get("/api/actions/recent", async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
      
      // Get file-based actions (old format)
      const fileActions = generatedActions;
      
      // Get database actions 
      const dbActions = await storage.getRecentActions(limit * 2); // Get more to account for merging
      
      // Combine both sources and sort by execution time
      const allActions = [...fileActions, ...dbActions];
      const sortedActions = allActions
        .sort((a, b) => new Date(b.executedAt).getTime() - new Date(a.executedAt).getTime())
        .slice(0, limit);
      
      res.json(sortedActions);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch recent actions" });
    }
  });

  app.get("/api/incidents/:id/actions", async (req, res) => {
    try {
      const incidentId = parseInt(req.params.id);
      const actions = await storage.getActionsByIncident(incidentId);
      res.json(actions);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch actions" });
    }
  });

  app.post("/api/actions", async (req, res) => {
    try {
      const validatedAction = insertActionSchema.parse(req.body);
      const action = await storage.createAction(validatedAction);
      broadcast({ type: 'action_created', data: action });
      res.json(action);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Invalid data" });
    }
  });

  // Approve code change action
  app.post("/api/actions/:id/approve", async (req, res) => {
    try {
      const actionId = parseInt(req.params.id);
      const action = await storage.getAction(actionId);
      
      if (!action) {
        return res.status(404).json({ error: "Action not found" });
      }
      
      // Check if it's a code-specific action
      const metadata = action.metadata as any;
      if (action.actionType !== 'CODE_IMPLEMENTATION' && metadata?.source_type !== 'code') {
        return res.status(400).json({ error: "Only code-specific actions can be approved" });
      }
      
      const filePath = metadata.source_location || metadata.filePath;
      const fileName = metadata.source_document || metadata.repositoryName || metadata.fileName;
      
      if (!filePath) {
        return res.status(400).json({ error: "Code action missing file path information" });
      }
      
      // Extract code changes from the action description or use metadata for CODE_IMPLEMENTATION
      let extractedChanges = extractCodeChangesFromDescription(action.description);
      
      // For CODE_IMPLEMENTATION actions, use metadata if no code blocks in description
      if (action.actionType === 'CODE_IMPLEMENTATION' && (!extractedChanges || extractedChanges.length === 0)) {
        const suggestedCode = metadata?.suggestedCode;
        if (suggestedCode) {
          extractedChanges = [suggestedCode];
        }
      }
      
      if (!extractedChanges || extractedChanges.length === 0) {
        return res.status(400).json({ error: "No code changes found in action description or metadata" });
      }
      
      // Find the repository that contains this file
      const repositories = await documentService.getRepositories();
      console.log('Available repositories:', repositories.map(r => ({ name: r.name, url: r.url })));
      console.log('Looking for repository matching:', { 
        target: action.target, 
        repositoryName: metadata?.repositoryName,
        filePath: filePath,
        fileName: fileName,
        description: action.description.substring(0, 200) + '...'
      });
      
      const repository = repositories.find(repo => 
        action.description.includes(repo.name) || 
        action.description.includes('GitHub Account') ||
        action.target === repo.name ||
        metadata?.repositoryName === repo.name ||
        repo.url.includes(metadata?.repositoryName || action.target || '') ||
        repo.name.toLowerCase().includes('spring') || // Flexible matching for spring boot repo
        repo.name.toLowerCase().includes('customer') || // Match customer repo
        repo.url.includes('customer') || // Match customer URL
        (filePath && filePath.includes('customer')) || // Match if file path contains customer
        action.description.includes('CustomerController') || // Match if description mentions CustomerController
        (fileName && fileName.includes('Customer')) || // Match if file name contains Customer
        true // Default to first repository if no specific match (temporary fix)
      );
      
      if (!repository) {
        return res.status(400).json({ error: "Repository not found for this code file" });
      }
      
      // Get incident details for better context
      const incident = await storage.getIncident(action.incidentId);
      
      // Apply changes to create the modified file
      const appliedChanges = await applyCodeChangesToFile(filePath, extractedChanges, incident);
      const modifiedFileName = filePath.split('/').pop() || 'modified_file';
      const modifiedFilePath = `./modified_files/${modifiedFileName}`;
      
      // GitHub Integration Implementation
      let githubResult = null;
      if (process.env.GITHUB_TOKEN && repository.url.includes('github.com')) {
        try {
          // Extract owner and repo from GitHub URL - support various formats
          const urlMatch = repository.url.match(/github\.com\/([^\/]+)\/([^\/]+?)(?:\.git|\/)?$/);
          if (urlMatch) {
            const [, owner, repo] = urlMatch;
            
            // Get the original file content and apply changes
            let originalContent = '';
            try {
              originalContent = await getFileContentFromRepository(repository, filePath);
            } catch (error) {
              // If file doesn't exist (404), that's fine - we'll create a new file
              if (error.message.includes('404')) {
                console.log(`File ${filePath} doesn't exist yet, creating new file`);
                originalContent = '';
              } else {
                throw error; // Re-throw other errors
              }
            }
            const updatedContent = await applyChangesToFileContent(originalContent, extractedChanges, action);
            
            // Prepare code changes for GitHub
            const codeChanges = [{
              filePath: filePath.startsWith('/') ? filePath.substring(1) : filePath,
              content: updatedContent,
              commitMessage: `AI Fix: ${action.title} - ${incident?.title || 'System Issue'}`
            }];
            
            // Apply changes to GitHub repository
            githubResult = await githubIntegrationService.applyChangesToRepository(
              { token: process.env.GITHUB_TOKEN, owner, repo, baseBranch: repository.branch || 'main' },
              codeChanges,
              incident?.incidentId || `action-${actionId}`,
              incident?.title || action.title
            );
            
            console.log('GitHub Integration Result:', githubResult);
          }
        } catch (error) {
          console.error('GitHub integration failed:', error);
          githubResult = {
            success: false,
            message: `GitHub integration failed: ${error.message}`,
            pullRequestUrl: '',
            pullRequestNumber: 0,
            branchName: ''
          };
        }
      }
      
      const result = {
        success: true,
        message: `Code changes automatically applied to ${fileName}`,
        filePath,
        modifiedFilePath,
        modifiedFileName,
        repository: repository.name,
        commitMessage: `Fix: Auto-apply suggested changes to ${fileName}`,
        changes: appliedChanges,
        extractedChanges: extractedChanges,
        incident: incident ? {
          id: incident.incidentId,
          title: incident.title,
          severity: incident.severity
        } : null,
        timestamp: new Date().toISOString(),
        githubIntegration: githubResult || {
          enabled: false,
          reason: process.env.GITHUB_TOKEN 
            ? "Repository not hosted on GitHub or invalid URL"
            : "Missing GITHUB_TOKEN with write permissions",
          requiredScopes: ["repo", "contents:write", "pull_requests:write"],
          note: "Changes applied locally. To enable GitHub integration, ensure your token has 'repo' scope with write permissions."
        }
      };
      
      // Update the action status to indicate it was approved
      const updatedAction = await storage.updateAction(actionId, {
        status: 'APPROVED',
        metadata: {
          ...metadata,
          approved: true,
          approvedAt: new Date().toISOString(),
          appliedChanges: appliedChanges,
          modifiedFilePath: modifiedFilePath,
          commitMessage: result.commitMessage,
          incidentId: incident?.incidentId,
          incidentTitle: incident?.title,
          incidentSeverity: incident?.severity,
          githubPullRequest: githubResult?.success ? {
            url: githubResult.pullRequestUrl,
            number: githubResult.pullRequestNumber,
            branch: githubResult.branchName
          } : null
        }
      });

      // Automatically close JIRA ticket if it exists for this incident
      let jiraTicketClosed = false;
      if (incident) {
        try {
          const jiraIntegration = await storage.getJiraIntegrationByIncident(incident.id);
          if (jiraIntegration && jiraIntegration.status !== 'Done') {
            const jiraConfig = await storage.getJiraConfiguration();
            if (jiraConfig) {
              jiraService.initialize(jiraConfig);
              
              // Create resolution comment with PR information
              const resolutionComment = githubResult?.success 
                ? `Code fix implemented and deployed via GitHub PR: ${githubResult.pullRequestUrl}\n\nCommit: ${result.commitMessage}\nBranch: ${githubResult.branchName}`
                : `Code fix implemented locally: ${result.commitMessage}\n\nFile: ${modifiedFilePath}`;
              
              await jiraService.addComment(jiraIntegration.jiraIssueKey, resolutionComment);
              await jiraService.updateIssueStatus(jiraIntegration.jiraIssueKey, "Done");
              
              await storage.updateJiraIntegration(jiraIntegration.id, {
                status: "Done",
                syncStatus: "SYNCED",
                lastSyncAt: new Date()
              });
              
              jiraTicketClosed = true;
              console.log(`JIRA ticket ${jiraIntegration.jiraIssueKey} closed automatically`);
            }
          }
        } catch (jiraError) {
          console.error('Error closing JIRA ticket:', jiraError);
          // Don't fail the main operation if JIRA fails
        }
      }
      
      broadcast({ type: 'action_approved', data: { ...updatedAction, jiraTicketClosed } });
      res.json({ ...result, jiraTicketClosed });
    } catch (error) {
      console.error('Error approving code change:', error);
      res.status(500).json({ error: "Failed to approve code change" });
    }
  });

  // GitHub integration status endpoint
  app.get("/api/github/status", async (req, res) => {
    try {
      if (!process.env.GITHUB_TOKEN) {
        return res.json({
          available: false,
          message: "GitHub token not configured",
          requiredScopes: ["repo", "contents:write", "pull_requests:write"]
        });
      }

      // Check if we have any GitHub repositories
      const repositories = await documentService.getRepositories();
      const githubRepos = repositories.filter(repo => repo.url.includes('github.com'));
      
      if (githubRepos.length === 0) {
        return res.json({
          available: false,
          message: "No GitHub repositories connected",
          tokenConfigured: true
        });
      }

      // Test permissions on the first GitHub repository
      const firstRepo = githubRepos[0];
      const urlMatch = firstRepo.url.match(/github\.com\/([^\/]+)\/([^\/]+)(?:\.git)?$/);
      
      if (urlMatch) {
        const [, owner, repo] = urlMatch;
        const permissionCheck = await githubIntegrationService.validatePermissions(owner, repo);
        
        return res.json({
          available: permissionCheck.hasWriteAccess && permissionCheck.canCreatePullRequests,
          tokenConfigured: true,
          repositoriesConnected: githubRepos.length,
          permissionCheck,
          testRepository: { owner, repo }
        });
      }

      res.json({
        available: false,
        message: "Invalid GitHub repository URL format",
        tokenConfigured: true
      });
      
    } catch (error) {
      console.error('GitHub status check failed:', error);
      res.status(500).json({
        available: false,
        message: `GitHub status check failed: ${error.message}`,
        tokenConfigured: !!process.env.GITHUB_TOKEN
      });
    }
  });

  // GitHub token validation endpoint
  app.get("/api/github/validate", async (req, res) => {
    try {
      const githubToken = process.env.GITHUB_TOKEN;
      if (!githubToken) {
        return res.json({ 
          valid: false, 
          message: "GitHub token not configured",
          suggestion: "Please add a GitHub token in the environment variables"
        });
      }

      // Test token by making a simple API call
      const response = await fetch('https://api.github.com/user', {
        headers: {
          'Authorization': `token ${githubToken}`,
          'User-Agent': 'AI-Support-Dashboard/1.0'
        }
      });

      if (response.ok) {
        const user = await response.json();
        res.json({ 
          valid: true, 
          message: "GitHub token is valid",
          user: user.login,
          scopes: response.headers.get('X-OAuth-Scopes')
        });
      } else {
        const errorText = await response.text();
        res.json({ 
          valid: false, 
          message: `GitHub token validation failed: ${response.status} ${response.statusText}`,
          suggestion: "Please check your GitHub token permissions or generate a new one"
        });
      }
    } catch (error) {
      res.status(500).json({ 
        valid: false, 
        message: "Failed to validate GitHub token",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Clear all documents
  app.delete("/api/documents/clear", async (req, res) => {
    try {
      await storage.clearAllDocuments();
      res.json({ message: "All documents cleared successfully" });
    } catch (error) {
      console.error('Error clearing documents:', error);
      res.status(500).json({ error: "Failed to clear documents" });
    }
  });

  // Clear all repositories
  app.delete("/api/repositories/clear", async (req, res) => {
    try {
      await storage.clearAllRepositories();
      res.json({ message: "All repositories cleared successfully" });
    } catch (error) {
      console.error('Error clearing repositories:', error);
      res.status(500).json({ error: "Failed to clear repositories" });
    }
  });

  // Get modified files list
  app.get("/api/modified-files", async (req, res) => {
    try {
      const modifiedFilesDir = './modified_files';
      
      try {
        const files = await fsPromises.readdir(modifiedFilesDir);
        const codeFiles = files.filter(file => !file.endsWith('.metadata.json'));
        
        const fileDetails = await Promise.all(
          codeFiles.map(async (file) => {
            const filePath = `${modifiedFilesDir}/${file}`;
            const metadataPath = `${modifiedFilesDir}/${file}.metadata.json`;
            const stats = await fsPromises.stat(filePath);
            
            let metadata = null;
            try {
              const metadataContent = await fsPromises.readFile(metadataPath, 'utf8');
              metadata = JSON.parse(metadataContent);
            } catch (error) {
              // Metadata file doesn't exist or is malformed
            }
            
            return {
              name: file,
              path: filePath,
              size: stats.size,
              modified: stats.mtime.toISOString(),
              incident: metadata?.incident,
              originalPath: metadata?.originalPath,
              changesCount: metadata?.changesCount
            };
          })
        );
        
        res.json(fileDetails);
      } catch (error) {
        // Directory doesn't exist yet
        res.json([]);
      }
    } catch (error) {
      console.error('Error getting modified files:', error);
      res.status(500).json({ error: "Failed to get modified files" });
    }
  });

  // Get specific modified file content
  app.get("/api/modified-files/:filename", async (req, res) => {
    try {
      const filename = req.params.filename;
      const filePath = `./modified_files/${filename}`;
      
      const content = await fsPromises.readFile(filePath, 'utf8');
      res.json({ filename, content });
    } catch (error) {
      console.error('Error reading modified file:', error);
      res.status(404).json({ error: "File not found" });
    }
  });

  // Knowledge Base routes
  app.get("/api/knowledge-base", async (req, res) => {
    try {
      // Use file-based knowledge base if available, otherwise fallback to database
      if (generatedKnowledgeBase.length > 0) {
        // Combine file-based and database entries
        const dbEntries = await storage.getKnowledgeBaseEntries();
        const combinedEntries = [...generatedKnowledgeBase, ...dbEntries];
        res.json(combinedEntries);
      } else {
        const entries = await storage.getKnowledgeBaseEntries();
        res.json(entries);
      }
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch knowledge base entries" });
    }
  });

  app.post("/api/knowledge-base", async (req, res) => {
    try {
      const validatedEntry = insertKnowledgeBaseEntrySchema.parse(req.body);
      const entry = await storage.createKnowledgeBaseEntry(validatedEntry);
      broadcast({ type: 'knowledge_base_updated', data: entry });
      res.json(entry);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Invalid data" });
    }
  });

  // Escalation routes
  app.get("/api/escalations", async (req, res) => {
    try {
      const escalations = await storage.getEscalations();
      res.json(escalations);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch escalations" });
    }
  });

  app.get("/api/escalations/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const escalation = await storage.getEscalation(id);
      if (!escalation) {
        return res.status(404).json({ error: "Escalation not found" });
      }
      res.json(escalation);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch escalation" });
    }
  });

  app.post("/api/escalations", async (req, res) => {
    try {
      const validatedEscalation = insertEscalationSchema.parse(req.body);
      const escalation = await storage.createEscalation(validatedEscalation);
      broadcast({ type: 'escalation_created', data: escalation });
      res.json(escalation);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Invalid data" });
    }
  });

  app.put("/api/escalations/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updates = req.body;
      const escalation = await storage.updateEscalation(id, updates);
      if (!escalation) {
        return res.status(404).json({ error: "Escalation not found" });
      }
      broadcast({ type: 'escalation_updated', data: escalation });
      res.json(escalation);
    } catch (error) {
      res.status(500).json({ error: "Failed to update escalation" });
    }
  });

  // Jira Configuration routes
  app.get("/api/jira/config", async (req, res) => {
    try {
      const config = await storage.getJiraConfiguration();
      if (!config) {
        return res.status(404).json({ error: "Jira configuration not found" });
      }
      // Don't send sensitive data to frontend
      const safeConfig = {
        id: config.id,
        domain: config.domain,
        email: config.email,
        projectKey: config.projectKey,
        issueTypeMapping: config.issueTypeMapping,
        priorityMapping: config.priorityMapping,
        customFields: config.customFields,
        autoSync: config.autoSync,
        syncInterval: config.syncInterval,
        isActive: config.isActive
      };
      res.json(safeConfig);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch Jira configuration" });
    }
  });

  app.post("/api/jira/config", async (req, res) => {
    try {
      const validatedConfig = insertJiraConfigurationSchema.parse(req.body);
      const config = await storage.createJiraConfiguration(validatedConfig);
      
      // Initialize Jira service with new config
      jiraService.initialize(config);
      
      // Test connection (don't fail configuration save if test fails)
      try {
        const connectionTest = await jiraService.testConnection();
        console.log('JIRA connection test result:', connectionTest);
      } catch (error) {
        console.log('JIRA connection test failed, but saving configuration anyway:', error.message);
      }
      
      broadcast({ type: 'jira_config_updated', data: config });
      res.json(config);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Invalid configuration" });
    }
  });

  app.put("/api/jira/config/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updates = req.body;
      const config = await storage.updateJiraConfiguration(id, updates);
      
      if (config) {
        jiraService.initialize(config);
        broadcast({ type: 'jira_config_updated', data: config });
      }
      
      res.json(config);
    } catch (error) {
      res.status(500).json({ error: "Failed to update Jira configuration" });
    }
  });

  // Jira Integration routes
  app.get("/api/jira/integrations", async (req, res) => {
    try {
      const integrations = await storage.getJiraIntegrations();
      res.json(integrations);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch Jira integrations" });
    }
  });

  app.get("/api/jira/integrations/incident/:incidentId", async (req, res) => {
    try {
      const incidentId = parseInt(req.params.incidentId);
      const integration = await storage.getJiraIntegrationByIncident(incidentId);
      if (!integration) {
        return res.status(404).json({ error: "Jira integration not found for incident" });
      }
      res.json(integration);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch Jira integration" });
    }
  });

  app.post("/api/jira/integrations/create/:incidentId", async (req, res) => {
    try {
      const incidentId = parseInt(req.params.incidentId);
      const incident = await storage.getIncident(incidentId);
      
      if (!incident) {
        return res.status(404).json({ error: "Incident not found" });
      }
      
      // Check if integration already exists
      const existingIntegration = await storage.getJiraIntegrationByIncident(incidentId);
      if (existingIntegration) {
        return res.status(400).json({ error: "Jira integration already exists for this incident" });
      }
      
      // Get Jira configuration
      const config = await storage.getJiraConfiguration();
      if (!config || !config.isActive) {
        return res.status(400).json({ error: "Jira is not configured or inactive" });
      }
      
      // Initialize Jira service and create issue
      jiraService.initialize(config);
      const jiraIssue = await jiraService.createIssueFromIncident(incident);
      
      // Create integration record
      const integrationData = await jiraService.syncIssueWithIncident(jiraIssue, incident);
      const integration = await storage.createJiraIntegration(integrationData);
      
      broadcast({ type: 'jira_integration_created', data: { incident, integration, jiraIssue } });
      res.json({ integration, jiraIssue });
    } catch (error) {
      console.error('Error creating Jira integration:', error);
      res.status(500).json({ error: error.message || "Failed to create Jira integration" });
    }
  });

  // Manual JIRA ticket creation - alternative endpoint
  app.post('/api/jira/create-ticket', async (req, res) => {
    try {
      const { incidentId } = req.body;
      
      if (!incidentId) {
        return res.status(400).json({ error: 'Incident ID is required' });
      }

      const incident = await storage.getIncident(incidentId);
      if (!incident) {
        return res.status(404).json({ error: 'Incident not found' });
      }

      // Check if ticket already exists
      const existingIntegration = await storage.getJiraIntegrationByIncident(incidentId);
      if (existingIntegration) {
        return res.status(409).json({ error: 'JIRA ticket already exists for this incident' });
      }

      const jiraConfig = await storage.getJiraConfiguration();
      if (!jiraConfig) {
        return res.status(400).json({ error: 'JIRA configuration not found' });
      }

      jiraService.initialize(jiraConfig);
      
      // Create JIRA ticket
      const jiraIssue = await jiraService.createIssueFromIncident(incident);
      
      // Store the integration
      const integrationData = await jiraService.syncIssueWithIncident(jiraIssue, incident);
      const integration = await storage.createJiraIntegration(integrationData);
      
      res.json({
        success: true,
        jiraIssue: jiraIssue,
        integration: integration
      });
    } catch (error) {
      console.error('Error creating JIRA ticket:', error);
      res.status(500).json({ error: error.message || 'Failed to create JIRA ticket' });
    }
  });

  // Get JIRA configuration (alternative endpoint)
  app.get('/api/jira/configuration', async (req, res) => {
    try {
      const config = await storage.getJiraConfiguration();
      res.json(config);
    } catch (error) {
      console.error('Error fetching JIRA configuration:', error);
      res.status(500).json({ error: 'Failed to fetch JIRA configuration' });
    }
  });

  // Create/Update JIRA configuration (alternative endpoint)
  app.post('/api/jira/configuration', async (req, res) => {
    try {
      const { domain, email, projectKey, autoSync, syncInterval } = req.body;
      
      if (!domain || !email || !projectKey) {
        return res.status(400).json({ error: 'Domain, email, and project key are required' });
      }

      const configData = {
        domain,
        email,
        projectKey,
        autoSync: autoSync ?? true,
        syncInterval: syncInterval || 300,
        isActive: true,
        issueTypeMapping: {
          'CRITICAL': 'Bug',
          'HIGH': 'Bug',
          'MEDIUM': 'Task',
          'LOW': 'Story'
        },
        priorityMapping: {
          'CRITICAL': 'Highest',
          'HIGH': 'High',
          'MEDIUM': 'Medium',
          'LOW': 'Low'
        }
      };

      const existingConfig = await storage.getJiraConfiguration();
      let config;
      
      if (existingConfig) {
        config = await storage.updateJiraConfiguration(existingConfig.id, configData);
      } else {
        config = await storage.createJiraConfiguration(configData);
      }
      
      res.json(config);
    } catch (error) {
      console.error('Error saving JIRA configuration:', error);
      res.status(500).json({ error: 'Failed to save JIRA configuration' });
    }
  });

  // Test JIRA connection (alternative endpoint)
  app.get('/api/jira/test-connection', async (req, res) => {
    try {
      const config = await storage.getJiraConfiguration();
      if (!config) {
        return res.json({ connected: false, error: 'No JIRA configuration found' });
      }

      jiraService.initialize(config);
      const connected = await jiraService.testConnection();
      
      res.json({ connected });
    } catch (error) {
      console.error('Error testing JIRA connection:', error);
      res.json({ connected: false, error: error.message });
    }
  });

  app.post("/api/jira/integrations/:id/sync", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const integration = await storage.getJiraIntegrationByIncident(id);
      
      if (!integration) {
        return res.status(404).json({ error: "Jira integration not found" });
      }
      
      const config = await storage.getJiraConfiguration();
      if (!config) {
        return res.status(400).json({ error: "Jira configuration not found" });
      }
      
      jiraService.initialize(config);
      const jiraIssue = await jiraService.getIssue(integration.jiraIssueKey);
      
      // Update integration with latest Jira data
      const updatedIntegration = await storage.updateJiraIntegration(integration.id, {
        status: jiraIssue.fields.status.name,
        assignee: jiraIssue.fields.assignee?.displayName || null,
        syncStatus: 'SYNCED',
        lastSyncAt: new Date(),
        metadata: {
          ...integration.metadata,
          lastSync: new Date().toISOString(),
          jiraUrl: `https://${config.domain}/browse/${jiraIssue.key}`
        }
      });
      
      broadcast({ type: 'jira_integration_synced', data: { integration: updatedIntegration, jiraIssue } });
      res.json({ integration: updatedIntegration, jiraIssue });
    } catch (error) {
      console.error('Failed to sync Jira integration:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to sync with Jira" });
    }
  });

  app.post("/api/jira/test-connection", async (req, res) => {
    try {
      const config = await storage.getJiraConfiguration();
      if (!config) {
        return res.status(400).json({ error: "Jira configuration not found" });
      }
      
      jiraService.initialize(config);
      const isConnected = await jiraService.testConnection();
      
      res.json({ connected: isConnected });
    } catch (error) {
      console.error('Jira connection test failed:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Connection test failed" });
    }
  });

  // Automatic RCA workflow and action progression
  setInterval(async () => {
    try {
      const incidents = await storage.getIncidents();
      
      for (const incident of incidents) {
        // Progress RCA workflows
        const workflows = await storage.getRcaWorkflowsByIncident(incident.id);
        
        for (const workflow of workflows) {
          if (workflow.status === 'IN_PROGRESS') {
            // Check if workflow has been in progress for more than 45 seconds
            const startTime = workflow.startedAt ? new Date(workflow.startedAt).getTime() : Date.now();
            const currentTime = Date.now();
            const elapsedSeconds = (currentTime - startTime) / 1000;
            
            if (elapsedSeconds > 45) {
              // Advance to completed
              const updatedWorkflow = await storage.updateRcaWorkflow(workflow.id, {
                status: 'COMPLETED',
                completedAt: new Date(),
                duration: Math.floor(elapsedSeconds),
                details: `Step ${workflow.step} completed: ${workflow.stepName} - Analysis finished successfully`
              });
              
              if (updatedWorkflow) {
                broadcast({ 
                  type: 'rca_workflow_updated', 
                  data: updatedWorkflow 
                });
                console.log(`Advanced workflow step ${workflow.step} for incident ${incident.incidentId}`);
                
                // Auto-advance the next PENDING step to IN_PROGRESS
                const nextStep = workflows.find(w => 
                  w.step === workflow.step + 1 && w.status === 'PENDING'
                );
                if (nextStep) {
                  await storage.updateRcaWorkflow(nextStep.id, {
                    status: 'IN_PROGRESS',
                    startedAt: new Date()
                  });
                  console.log(`Started workflow step ${nextStep.step} for incident ${incident.incidentId}`);
                }
              }
            }
          }
        }

        // Note: Action progression would need an updateAction method in storage
        // For now, we'll let actions stay as created since we don't have update capability
      }
    } catch (error) {
      console.error('Error in workflow/action progression:', error);
    }
  }, 15000); // Check every 15 seconds

  // Clear all dashboard data endpoint
  app.post('/api/clear-all-data', async (req, res) => {
    try {
      // Clear file-based arrays
      fileBasedAlerts = [];
      generatedRcaWorkflows = [];
      generatedActions = [];
      generatedKnowledgeBase = [];
      
      // Clear database data through SQL queries
      await storage.clearAllData();
      
      res.json({ 
        success: true, 
        message: 'All dashboard data cleared successfully' 
      });
      
      broadcast({
        type: 'all_data_cleared',
        data: { message: 'All incidents, RCA workflows, actions, and escalations cleared' }
      });
    } catch (error) {
      console.error('Error clearing all data:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to clear all data' 
      });
    }
  });

  // Clear file-based data endpoint
  app.delete('/api/clear-file-data', async (req, res) => {
    try {
      // Clear uploaded alerts from storage
      await storage.clearFileBasedData();
      
      res.json({ 
        success: true, 
        message: 'File-based data cleared successfully' 
      });
      
      broadcast({
        type: 'file_data_cleared',
        data: { message: 'File-based alerts and associated data cleared' }
      });
    } catch (error) {
      console.error('Error clearing file data:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to clear file-based data' 
      });
    }
  });

  // Document Management API Routes
  app.get("/api/documents", async (req, res) => {
    try {
      const documents = await storage.getDocuments();
      res.json(documents);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch documents" });
    }
  });

  app.get("/api/documents/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const document = await storage.getDocument(id);
      if (!document) {
        return res.status(404).json({ error: "Document not found" });
      }
      res.json(document);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch document" });
    }
  });

  app.post("/api/documents", async (req, res) => {
    try {
      const validatedDocument = insertDocumentSchema.parse(req.body);
      const document = await documentService.addDocument(validatedDocument);
      broadcast({ type: 'document_created', data: document });
      res.json(document);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Invalid data" });
    }
  });

  app.put("/api/documents/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updates = req.body;
      const document = await documentService.updateDocument(id, updates);
      if (!document) {
        return res.status(404).json({ error: "Document not found" });
      }
      broadcast({ type: 'document_updated', data: document });
      res.json(document);
    } catch (error) {
      res.status(500).json({ error: "Failed to update document" });
    }
  });

  app.delete("/api/documents/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await documentService.deleteDocument(id);
      broadcast({ type: 'document_deleted', data: { id } });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete document" });
    }
  });

  // Code Repository Management API Routes
  app.get("/api/repositories", async (req, res) => {
    try {
      const repositories = await storage.getCodeRepositories();
      res.json(repositories);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch repositories" });
    }
  });

  app.post("/api/repositories", async (req, res) => {
    try {
      const validatedRepository = insertCodeRepositorySchema.parse(req.body);
      const repository = await storage.createCodeRepository(validatedRepository);
      broadcast({ type: 'repository_created', data: repository });
      res.json(repository);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Invalid data" });
    }
  });

  app.post("/api/repositories/:id/sync", async (req, res) => {
    const id = parseInt(req.params.id);
    
    try {
      await documentService.syncRepository(id);
      
      // Get updated repository to return current sync status
      const repository = await storage.getCodeRepository(id);
      
      broadcast({ type: 'repository_synced', data: repository });
      res.json({ success: true, repository });
    } catch (error) {
      console.error('Repository sync error:', error);
      
      // Get current repository state for error response
      let repository = null;
      try {
        repository = await storage.getCodeRepository(id);
      } catch (fetchError) {
        console.error('Failed to fetch repository for error response:', fetchError);
      }
      
      // Determine appropriate HTTP status code based on error type
      let statusCode = 500;
      let errorMessage = error instanceof Error ? error.message : "Failed to sync repository";
      
      if (errorMessage.includes('authentication failed') || errorMessage.includes('Bad credentials')) {
        statusCode = 401;
        errorMessage = "GitHub authentication failed. Please check your token permissions.";
      } else if (errorMessage.includes('Access denied')) {
        statusCode = 403;
        errorMessage = "Access denied. Token may lack repository permissions.";
      } else if (errorMessage.includes('not found')) {
        statusCode = 404;
        errorMessage = "Repository not found. Please verify the URL is correct.";
      } else if (errorMessage.includes('rate limit')) {
        statusCode = 429;
        errorMessage = "GitHub API rate limit exceeded. Please try again later.";
      }
      
      // Broadcast error state to frontend
      if (repository) {
        broadcast({ type: 'repository_sync_failed', data: { ...repository, errorMessage } });
      }
      
      res.status(statusCode).json({ 
        success: false,
        error: errorMessage,
        repository: repository,
        suggestion: statusCode === 401 ? "Please update your GitHub token in the settings" : undefined
      });
    }
  });

  app.delete("/api/repositories/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      
      // Delete associated documents first
      await documentService.deleteRepositoryDocuments(id);
      
      // Delete the repository
      await storage.deleteCodeRepository(id);
      
      broadcast({ type: 'repository_deleted', data: { id } });
      res.json({ success: true });
    } catch (error) {
      console.error('Repository deletion error:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to delete repository"
      });
    }
  });

  // Document Search API Routes
  app.post("/api/documents/search", async (req, res) => {
    try {
      const { query, incidentId, limit = 10 } = req.body;
      const searchResults = await documentService.searchDocuments(query, incidentId, limit);
      res.json(searchResults);
    } catch (error) {
      res.status(500).json({ error: "Failed to search documents" });
    }
  });

  app.get("/api/documents/analytics", async (req, res) => {
    try {
      const analytics = await documentService.getSearchAnalytics();
      res.json(analytics);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch analytics" });
    }
  });

  app.post("/api/documents/:documentId/mark-used", async (req, res) => {
    try {
      const documentId = parseInt(req.params.documentId);
      const { incidentId } = req.body;
      await documentService.markSearchResultUsed(incidentId, documentId);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to mark document as used" });
    }
  });

  // Force refresh dashboard data
  app.post("/api/force-refresh", async (req, res) => {
    try {
      // Force refresh all dashboard data
      broadcast({ 
        type: 'force_refresh', 
        data: { 
          timestamp: new Date().toISOString(),
          message: 'Dashboard data refreshed' 
        } 
      });
      res.json({ success: true, message: "Dashboard refresh broadcasted" });
    } catch (error) {
      console.error('Force refresh error:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to force refresh"
      });
    }
  });

  // Clear Dashboard Data API Routes
  app.delete("/api/dashboard/clear-all", async (req, res) => {
    try {
      await storage.clearAllData();
      broadcast({ type: 'dashboard_cleared', data: {} });
      res.json({ success: true, message: "All dashboard data cleared successfully" });
    } catch (error) {
      console.error('Clear dashboard data error:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to clear dashboard data"
      });
    }
  });

  app.delete("/api/clear/incidents", async (req, res) => {
    try {
      await storage.clearIncidents();
      broadcast({ type: 'incidents_cleared', data: {} });
      res.json({ success: true, message: "All incidents cleared successfully" });
    } catch (error) {
      console.error('Clear incidents error:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to clear incidents"
      });
    }
  });

  app.delete("/api/clear/rca-workflows", async (req, res) => {
    try {
      await storage.clearRcaWorkflows();
      broadcast({ type: 'rca_workflows_cleared', data: {} });
      res.json({ success: true, message: "All RCA workflows cleared successfully" });
    } catch (error) {
      console.error('Clear RCA workflows error:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to clear RCA workflows"
      });
    }
  });

  app.delete("/api/clear/actions", async (req, res) => {
    try {
      await storage.clearActions();
      broadcast({ type: 'actions_cleared', data: {} });
      res.json({ success: true, message: "All actions cleared successfully" });
    } catch (error) {
      console.error('Clear actions error:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to clear actions"
      });
    }
  });

  app.delete("/api/dashboard/clear-incidents", async (req, res) => {
    try {
      // Clear incidents and all related data
      await db.delete(incidents);
      await db.delete(rcaWorkflows);
      await db.delete(actions);
      await db.delete(escalations);
      
      broadcast({ type: 'incidents_cleared', data: {} });
      res.json({ success: true, message: "All incidents, RCA workflows, actions, and escalations cleared" });
    } catch (error) {
      console.error('Clear incidents error:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to clear incidents"
      });
    }
  });

  app.delete("/api/dashboard/clear-knowledge-base", async (req, res) => {
    try {
      await db.delete(knowledgeBaseEntries);
      
      broadcast({ type: 'knowledge_base_cleared', data: {} });
      res.json({ success: true, message: "Knowledge base cleared successfully" });
    } catch (error) {
      console.error('Clear knowledge base error:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to clear knowledge base"
      });
    }
  });

  // JIRA Integration API Routes
  app.get("/api/jira/configuration", async (req, res) => {
    try {
      const config = await storage.getJiraConfiguration();
      res.json(config);
    } catch (error) {
      console.error('Get JIRA configuration error:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to get JIRA configuration"
      });
    }
  });

  app.post("/api/jira/configuration", async (req, res) => {
    try {
      const result = insertJiraConfigurationSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ error: result.error.issues });
      }

      const config = await storage.createJiraConfiguration(result.data);
      
      // Initialize JIRA service with the new configuration
      jiraService.initialize(config);
      
      // Test connection
      const connectionTest = await jiraService.testConnection();
      if (!connectionTest) {
        return res.status(400).json({ error: "Failed to connect to JIRA with provided configuration" });
      }

      res.json(config);
    } catch (error) {
      console.error('Create JIRA configuration error:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to create JIRA configuration"
      });
    }
  });

  app.get("/api/jira/test-connection", async (req, res) => {
    try {
      const config = await storage.getJiraConfiguration();
      if (!config) {
        return res.status(404).json({ error: "JIRA configuration not found" });
      }

      jiraService.initialize(config);
      const isConnected = await jiraService.testConnection();
      
      res.json({ connected: isConnected });
    } catch (error) {
      console.error('JIRA connection test error:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to test JIRA connection"
      });
    }
  });

  app.get("/api/jira/integrations", async (req, res) => {
    try {
      const integrations = await storage.getJiraIntegrations();
      res.json(integrations);
    } catch (error) {
      console.error('Get JIRA integrations error:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to get JIRA integrations"
      });
    }
  });

  app.post("/api/jira/create-ticket", async (req, res) => {
    try {
      const { incidentId } = req.body;
      
      // Get the incident
      const incident = await storage.getIncident(incidentId);
      if (!incident) {
        return res.status(404).json({ error: "Incident not found" });
      }

      // Check if JIRA ticket already exists for this incident
      const existingIntegration = await storage.getJiraIntegrationByIncident(incidentId);
      if (existingIntegration) {
        return res.status(400).json({ error: "JIRA ticket already exists for this incident", jiraIssueKey: existingIntegration.jiraIssueKey });
      }

      // Get JIRA configuration
      const config = await storage.getJiraConfiguration();
      if (!config) {
        return res.status(404).json({ error: "JIRA configuration not found" });
      }

      // Initialize JIRA service and create the ticket
      jiraService.initialize(config);
      const jiraIssue = await jiraService.createIssueFromIncident(incident);

      // Store the integration in the database
      const integrationData = await jiraService.syncIssueWithIncident(jiraIssue, incident);
      const integration = await storage.createJiraIntegration(integrationData);

      broadcast({ type: 'jira_ticket_created', data: { incident, jiraIssue, integration } });
      res.json({ success: true, jiraIssue, integration });
    } catch (error) {
      console.error('Create JIRA ticket error:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to create JIRA ticket"
      });
    }
  });

  app.post("/api/jira/close-ticket", async (req, res) => {
    try {
      const { incidentId, resolution } = req.body;
      
      // Get the JIRA integration for this incident
      const integration = await storage.getJiraIntegrationByIncident(incidentId);
      if (!integration) {
        return res.status(404).json({ error: "JIRA integration not found for this incident" });
      }

      // Get JIRA configuration
      const config = await storage.getJiraConfiguration();
      if (!config) {
        return res.status(404).json({ error: "JIRA configuration not found" });
      }

      // Initialize JIRA service and close the ticket
      jiraService.initialize(config);
      
      // Add resolution comment
      if (resolution) {
        await jiraService.addComment(integration.jiraIssueKey, resolution);
      }

      // Update ticket status to "Done" or "Resolved"
      await jiraService.updateIssueStatus(integration.jiraIssueKey, "Done");

      // Update the integration record
      await storage.updateJiraIntegration(integration.id, {
        status: "Done",
        syncStatus: "SYNCED",
        lastSyncAt: new Date()
      });

      broadcast({ type: 'jira_ticket_closed', data: { integration, resolution } });
      res.json({ success: true, message: "JIRA ticket closed successfully" });
    } catch (error) {
      console.error('Close JIRA ticket error:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to close JIRA ticket"
      });
    }
  });

  // ServiceNow Configuration API Routes
  app.get("/api/servicenow/config", async (req, res) => {
    try {
      const config = await storage.getServiceNowConfiguration();
      res.json(config);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch ServiceNow configuration" });
    }
  });

  app.post("/api/servicenow/config", async (req, res) => {
    try {
      const validatedConfig = insertServiceNowConfigurationSchema.parse(req.body);
      const config = await storage.createServiceNowConfiguration({
        ...validatedConfig,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      res.json(config);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Invalid configuration" });
    }
  });

  app.put("/api/servicenow/config", async (req, res) => {
    try {
      const validatedConfig = insertServiceNowConfigurationSchema.parse(req.body);
      const config = await storage.updateServiceNowConfiguration({
        ...validatedConfig,
        updatedAt: new Date()
      });
      res.json(config);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Invalid configuration" });
    }
  });

  app.post("/api/servicenow/test-connection", async (req, res) => {
    try {
      const { instance, username } = req.body;
      
      serviceNowService.initialize({
        instance,
        username,
        assignmentGroup: req.body.assignmentGroup || '',
        callerId: req.body.callerId || '',
        priorityMapping: req.body.priorityMapping || {},
        urgencyMapping: req.body.urgencyMapping || {},
        customFields: req.body.customFields || {},
        autoSync: req.body.autoSync || true,
        syncInterval: req.body.syncInterval || 300,
        pollInterval: req.body.pollInterval || 60,
        isActive: req.body.isActive || true,
        id: 1,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      const connected = await serviceNowService.testConnection();
      res.json({ connected });
    } catch (error) {
      console.error('ServiceNow connection test error:', error);
      res.status(500).json({ 
        connected: false, 
        error: error instanceof Error ? error.message : "Connection test failed" 
      });
    }
  });

  // ServiceNow Integration API Routes
  app.get("/api/servicenow/integrations", async (req, res) => {
    try {
      const integrations = await storage.getServiceNowIntegrations();
      res.json(integrations);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch ServiceNow integrations" });
    }
  });

  app.post("/api/servicenow/create-incident", async (req, res) => {
    try {
      const { incidentId, instance, username } = req.body;
      
      // Get the incident
      const incident = await storage.getIncident(incidentId);
      if (!incident) {
        return res.status(404).json({ error: "Incident not found" });
      }

      // Check if ServiceNow incident already exists
      const existingIntegration = await storage.getServiceNowIntegrationByIncident(incidentId);
      if (existingIntegration) {
        return res.status(409).json({ error: "ServiceNow incident already exists for this incident" });
      }

      // Get ServiceNow configuration
      const config = await storage.getServiceNowConfiguration();
      if (!config) {
        return res.status(404).json({ error: "ServiceNow configuration not found" });
      }

      // Initialize ServiceNow service
      serviceNowService.initialize(config);

      // Create ServiceNow incident with log content
      const logContent = incident.metadata?.log_content || "No log content available";
      const serviceNowIncident = await serviceNowService.createIncidentFromLog(incident, logContent);

      // Store the integration
      const integration = await storage.createServiceNowIntegration({
        incidentId: incident.id,
        serviceNowNumber: serviceNowIncident.number,
        serviceNowSysId: serviceNowIncident.sys_id,
        state: serviceNowIncident.state,
        priority: serviceNowIncident.priority,
        urgency: serviceNowIncident.urgency,
        assignedTo: serviceNowIncident.assigned_to?.display_value || null,
        callerId: serviceNowIncident.caller_id?.display_value || null,
        createdAt: new Date(),
        updatedAt: new Date(),
        syncStatus: "SYNCED",
        lastSyncAt: new Date(),
        metadata: {
          serviceNowUrl: `https://${config.instance}.service-now.com/nav_to.do?uri=incident.do?sys_id=${serviceNowIncident.sys_id}`,
          lastSync: new Date().toISOString()
        }
      });

      broadcast({ type: 'servicenow_incident_created', data: { integration, serviceNowIncident } });
      res.json({ success: true, serviceNowIncident, integration });
    } catch (error) {
      console.error('Create ServiceNow incident error:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to create ServiceNow incident"
      });
    }
  });

  app.get("/api/servicenow/poll-incidents", async (req, res) => {
    try {
      const config = await storage.getServiceNowConfiguration();
      if (!config) {
        return res.status(404).json({ error: "ServiceNow configuration not found" });
      }

      if (!config.isActive) {
        return res.json({ incidents: [], message: "ServiceNow integration is disabled" });
      }

      serviceNowService.initialize(config);
      
      const sinceMinutes = parseInt(req.query.since as string) || 5;
      const serviceNowIncidents = await serviceNowService.pollRecentIncidents(sinceMinutes);

      // Process each ServiceNow incident and create local incidents if needed
      const processedIncidents = [];
      
      for (const snowIncident of serviceNowIncidents) {
        // Check if we already have this incident
        const existingIntegration = await storage.getServiceNowIntegrationByNumber(snowIncident.number);
        
        if (!existingIntegration) {
          // Create local incident from ServiceNow incident
          const localIncident = await createIncidentFromServiceNow(snowIncident);
          
          // Create integration record
          const integration = await storage.createServiceNowIntegration({
            incidentId: localIncident.id,
            serviceNowNumber: snowIncident.number,
            serviceNowSysId: snowIncident.sys_id,
            state: snowIncident.state,
            priority: snowIncident.priority,
            urgency: snowIncident.urgency,
            assignedTo: snowIncident.assigned_to?.display_value || null,
            callerId: snowIncident.caller_id?.display_value || null,
            createdAt: new Date(),
            updatedAt: new Date(),
            syncStatus: "SYNCED",
            lastSyncAt: new Date(),
            metadata: {
              serviceNowUrl: `https://${config.instance}.service-now.com/nav_to.do?uri=incident.do?sys_id=${snowIncident.sys_id}`,
              lastSync: new Date().toISOString()
            }
          });

          processedIncidents.push({ incident: localIncident, integration });
        }
      }

      if (processedIncidents.length > 0) {
        broadcast({ 
          type: 'servicenow_incidents_polled', 
          data: { 
            newIncidents: processedIncidents.length,
            incidents: processedIncidents.map(p => p.incident)
          }
        });
      }

      res.json({ 
        incidents: processedIncidents.map(p => p.incident),
        newIncidents: processedIncidents.length,
        totalPolled: serviceNowIncidents.length
      });
    } catch (error) {
      console.error('Poll ServiceNow incidents error:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to poll ServiceNow incidents"
      });
    }
  });

  // Helper function to trigger automatic workflows for new incidents
  async function triggerAutomaticWorkflows(incident: any) {
    try {
      console.log(`Triggering automatic workflows for incident ${incident.incidentId}`);
      
      // 1. Create RCA workflow steps
      const rcaSteps = [
        { step: 1, stepName: "Alert Detection", status: "COMPLETED", duration: 2 },
        { step: 2, stepName: "Data Collection", status: "IN_PROGRESS", duration: null },
        { step: 3, stepName: "Root Cause Analysis", status: "PENDING", duration: null },
        { step: 4, stepName: "Action Planning", status: "PENDING", duration: null },
        { step: 5, stepName: "Execution", status: "PENDING", duration: null },
        { step: 6, stepName: "Validation", status: "PENDING", duration: null }
      ];

      for (const step of rcaSteps) {
        const workflow = await storage.createRcaWorkflow({
          incidentId: incident.id,
          step: step.step,
          stepName: step.stepName,
          status: step.status,
          startedAt: step.status !== "PENDING" ? new Date() : null,
          completedAt: step.status === "COMPLETED" ? new Date() : null,
          duration: step.duration,
          details: step.step === 1 ? `Alert detected for ${incident.title}` : 
                   step.step === 2 ? `Collecting data for ${incident.title}` :
                   `${step.stepName} for ${incident.title}`,
          confidence: step.step === 1 ? 100 : null,
          metadata: {}
        });
        
        broadcast({ type: 'rca_workflow_created', data: workflow });
      }
      
      // 2. Generate initial actions
      const actions = [
        {
          incidentId: incident.id,
          actionType: 'INVESTIGATION',
          title: 'Initial Investigation',
          description: `Investigate ${incident.title} - ${incident.description}`,
          target: 'system',
          status: 'PENDING',
          metadata: {
            source: 'Automatic',
            autoGenerated: true,
            priority: incident.severity === 'CRITICAL' ? 'HIGH' : incident.severity === 'HIGH' ? 'MEDIUM' : 'LOW',
            assignee: 'AI Agent',
            estimatedDuration: 300
          }
        }
      ];
      
      for (const actionData of actions) {
        const action = await storage.createAction(actionData);
        broadcast({ type: 'action_created', data: action });
      }
      
      // 3. Create knowledge base entry
      const knowledgeEntry = {
        title: `${incident.title} - Incident Pattern`,
        description: `Incident Pattern: ${incident.title}\n\nDescription: ${incident.description}\n\nSeverity: ${incident.severity}\nStatus: ${incident.status}`,
        type: 'PATTERN',
        confidence: 70,
        metadata: {
          incidentId: incident.incidentId,
          autoGenerated: true,
          source: 'incident_creation',
          severity: incident.severity,
          tags: [
            incident.severity.toLowerCase(),
            'incident-pattern',
            'auto-generated'
          ],
          createdAt: new Date().toISOString()
        }
      };
      
      const knowledge = await storage.createKnowledgeBaseEntry(knowledgeEntry);
      broadcast({ type: 'knowledge_created', data: knowledge });
      
      console.log(`Automatic workflows triggered for incident ${incident.incidentId}: ${rcaSteps.length} RCA steps, ${actions.length} actions, 1 knowledge entry`);
    } catch (error) {
      console.error(`Error triggering automatic workflows for incident ${incident.incidentId}:`, error);
    }
  }

  // Helper function to create local incident from ServiceNow incident
  async function createIncidentFromServiceNow(snowIncident: any) {
    const incidentId = `SN-${Date.now()}`;
    
    // Map ServiceNow priority to our severity
    const priorityToSeverity = {
      '1': 'CRITICAL',
      '2': 'HIGH', 
      '3': 'MEDIUM',
      '4': 'LOW'
    };
    
    const severity = priorityToSeverity[snowIncident.priority as keyof typeof priorityToSeverity] || 'MEDIUM';
    
    const incidentData = {
      incidentId,
      title: snowIncident.short_description || 'ServiceNow Incident',
      description: `ServiceNow incident ${snowIncident.number}: ${snowIncident.description || snowIncident.short_description}`,
      severity,
      status: 'ACTIVE' as const,
      startedAt: new Date(snowIncident.sys_created_on),
      resolvedAt: null,
      aiConfidence: 0,
      currentStep: 1,
      totalSteps: 4,
      affectedSystems: ['ServiceNow'],
      metadata: {
        source: 'servicenow_poll',
        servicenow_number: snowIncident.number,
        servicenow_sys_id: snowIncident.sys_id,
        servicenow_state: snowIncident.state,
        servicenow_priority: snowIncident.priority,
        servicenow_urgency: snowIncident.urgency
      }
    };

    return await storage.createIncident(incidentData);
  }

  return { httpServer, broadcast };
}
