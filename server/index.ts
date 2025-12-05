import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { storage } from "./storage";
import { ServiceNowService } from "./servicenow-service";

// Import broadcast function for real-time updates
let broadcast: any = null;

// Helper function to map ServiceNow priority to incident severity
function mapServiceNowPriorityToSeverity(priority: string): string {
  switch (priority) {
    case '1': return 'CRITICAL';
    case '2': return 'HIGH';
    case '3': return 'MEDIUM';
    case '4': 
    case '5': return 'LOW';
    default: return 'MEDIUM';
  }
}

// Function to automatically start RCA workflow for new incidents
async function startAutomaticRCAWorkflow(incident: any) {
  try {
    log(`Starting automatic RCA workflow for incident ${incident.incidentId}`);
    
    // Use AI analysis for log content if available
    const logContent = incident.metadata?.logContent || '';
    let aiAnalysis = null;
    
    if (logContent.trim()) {
      try {
        const aiService = new (await import('./ai-service')).AIService();
        aiAnalysis = await aiService.analyzeLogContent(logContent, incident.description, incident.id);
        log(`AI analysis completed for incident ${incident.incidentId}`);
      } catch (error) {
        console.error(`AI analysis failed for incident ${incident.incidentId}:`, error);
      }
    }
    
    // Create RCA workflow steps with AI-enhanced details
    const rcaSteps = [
      { 
        step: 1, 
        stepName: "Alert Detection", 
        status: "COMPLETED", 
        duration: 2,
        details: `Alert detected for ${incident.title}`,
        confidence: 100
      },
      { 
        step: 2, 
        stepName: "Data Collection", 
        status: "IN_PROGRESS", 
        duration: null,
        details: `Collecting data for ${incident.title}${logContent ? ' - Log files analyzed' : ''}`,
        confidence: null
      },
      { 
        step: 3, 
        stepName: "Root Cause Analysis", 
        status: "PENDING", 
        duration: null,
        details: aiAnalysis ? `AI Analysis: ${aiAnalysis.rootCauseAnalysis.primaryCause}` : `Root Cause Analysis for ${incident.title}`,
        confidence: aiAnalysis?.rootCauseAnalysis.confidence || null
      },
      { 
        step: 4, 
        stepName: "Action Planning", 
        status: "PENDING", 
        duration: null,
        details: aiAnalysis ? `${aiAnalysis.recommendedActions.length} recommended actions identified` : `Action Planning for ${incident.title}`,
        confidence: null
      },
      { 
        step: 5, 
        stepName: "Execution", 
        status: "PENDING", 
        duration: null,
        details: `Execution for ${incident.title}`,
        confidence: null
      },
      { 
        step: 6, 
        stepName: "Validation", 
        status: "PENDING", 
        duration: null,
        details: `Validation for ${incident.title}`,
        confidence: null
      }
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
        details: step.details,
        confidence: step.confidence,
        metadata: aiAnalysis && step.step === 3 ? {
          aiAnalysis: {
            primaryCause: aiAnalysis.rootCauseAnalysis.primaryCause,
            contributingFactors: aiAnalysis.rootCauseAnalysis.contributingFactors,
            affectedSystems: aiAnalysis.affectedSystems,
            confidence: aiAnalysis.rootCauseAnalysis.confidence
          }
        } : {}
      });
      
      broadcast({ type: 'rca_workflow_created', data: workflow });
    }
    
    log(`Created ${rcaSteps.length} RCA workflow steps for incident ${incident.incidentId}`);
  } catch (error) {
    console.error(`Error starting automatic RCA workflow for incident ${incident.incidentId}:`, error);
  }
}

// Function to automatically generate initial actions for new incidents
async function generateInitialActions(incident: any) {
  try {
    log(`Generating initial actions for incident ${incident.incidentId}`);
    
    // Generate actions based on incident severity and source
    const actions = [];
    
    // Use AI analysis for log content if available
    const logContent = incident.metadata?.logContent || '';
    let aiAnalysis = null;
    
    if (logContent.trim()) {
      try {
        const aiService = new (await import('./ai-service')).AIService();
        aiAnalysis = await aiService.analyzeLogContent(logContent, incident.description, incident.id);
        log(`AI analysis completed for action generation - ${incident.incidentId}`);
      } catch (error) {
        console.error(`AI analysis failed for action generation - ${incident.incidentId}:`, error);
      }
    }
    
    // Basic investigation action
    actions.push({
      incidentId: incident.id,
      actionType: 'INVESTIGATION',
      title: 'Initial Investigation',
      description: `Investigate ${incident.title} - ${incident.description}`,
      target: 'system',
      status: 'PENDING',
      metadata: {
        source: 'Automatic',
        incidentSource: incident.metadata?.source || 'Unknown',
        autoGenerated: true,
        priority: incident.severity === 'CRITICAL' ? 'HIGH' : incident.severity === 'HIGH' ? 'MEDIUM' : 'LOW',
        assignee: 'AI Agent',
        estimatedDuration: 300
      }
    });
    
    // Add AI-recommended actions if available
    if (aiAnalysis && aiAnalysis.recommendedActions) {
      for (const aiAction of aiAnalysis.recommendedActions) {
        actions.push({
          incidentId: incident.id,
          actionType: aiAction.actionType,
          title: aiAction.title,
          description: aiAction.description,
          target: 'system',
          status: 'PENDING',
          metadata: {
            source: 'AI Analysis',
            incidentSource: incident.metadata?.source || 'Unknown',
            autoGenerated: true,
            priority: aiAction.priority,
            assignee: 'AI Agent',
            estimatedDuration: parseInt(aiAction.estimatedTime) || 300,
            aiGenerated: true,
            rootCause: aiAnalysis.rootCauseAnalysis.primaryCause,
            // Add GitHub PR integration fields
            ...(aiAction.filePath && {
              filePath: aiAction.filePath,
              fileName: aiAction.fileName,
              repositoryName: aiAction.repositoryName || 'customer',
              source_location: aiAction.sourceLocation
            })
          }
        });
      }
    }
    
    // ServiceNow specific actions
    if (incident.metadata?.source === 'ServiceNow') {
      actions.push({
        incidentId: incident.id,
        actionType: 'SERVICENOW_SYNC',
        title: 'ServiceNow Synchronization',
        description: `Monitor ServiceNow incident ${incident.metadata.serviceNowNumber} for updates`,
        target: 'servicenow',
        status: 'PENDING',
        metadata: {
          serviceNowNumber: incident.metadata.serviceNowNumber,
          serviceNowSysId: incident.metadata.serviceNowSysId,
          autoGenerated: true,
          priority: 'LOW',
          assignee: 'AI Agent',
          estimatedDuration: 60
        }
      });
    }
    
    // Create actions in storage
    for (const actionData of actions) {
      const action = await storage.createAction(actionData);
      broadcast({ type: 'action_created', data: action });
    }
    
    log(`Created ${actions.length} initial actions for incident ${incident.incidentId}`);
  } catch (error) {
    console.error(`Error generating initial actions for incident ${incident.incidentId}:`, error);
  }
}

// Function to automatically update knowledge base for new incidents
async function updateKnowledgeBase(incident: any) {
  try {
    log(`Updating knowledge base for incident ${incident.incidentId}`);
    
    // Use AI analysis for log content if available
    const logContent = incident.metadata?.logContent || '';
    let aiAnalysis = null;
    
    if (logContent.trim()) {
      try {
        const aiService = new (await import('./ai-service')).AIService();
        aiAnalysis = await aiService.analyzeLogContent(logContent, incident.description, incident.id);
        log(`AI analysis completed for knowledge base update - ${incident.incidentId}`);
      } catch (error) {
        console.error(`AI analysis failed for knowledge base update - ${incident.incidentId}:`, error);
      }
    }
    
    // Create knowledge base entry based on incident and AI analysis
    const knowledgeEntry = {
      title: aiAnalysis ? aiAnalysis.knowledgeBaseUpdate.title : `${incident.title} - Incident Pattern`,
      description: aiAnalysis ? aiAnalysis.knowledgeBaseUpdate.description : 
        `Incident Pattern: ${incident.title}\n\nDescription: ${incident.description}\n\nSource: ${incident.metadata?.source || 'Unknown'}\nSeverity: ${incident.severity}\nStatus: ${incident.status}`,
      type: aiAnalysis ? aiAnalysis.knowledgeBaseUpdate.type.toUpperCase() : 'PATTERN',
      confidence: aiAnalysis ? aiAnalysis.knowledgeBaseUpdate.confidence : 70,
      metadata: {
        incidentId: incident.incidentId,
        autoGenerated: true,
        source: aiAnalysis ? 'ai_analysis' : 'incident_creation',
        severity: incident.severity,
        tags: [
          incident.severity.toLowerCase(),
          incident.metadata?.source?.toLowerCase() || 'unknown',
          'incident-pattern',
          'auto-generated'
        ],
        createdAt: new Date().toISOString(),
        ...(aiAnalysis && {
          aiAnalysis: {
            primaryCause: aiAnalysis.rootCauseAnalysis.primaryCause,
            affectedSystems: aiAnalysis.affectedSystems,
            confidence: aiAnalysis.rootCauseAnalysis.confidence
          }
        })
      }
    };
    
    // For ServiceNow incidents, add specific knowledge
    if (incident.metadata?.source === 'ServiceNow') {
      knowledgeEntry.metadata.tags.push('servicenow');
      knowledgeEntry.description += `\n\nServiceNow Details:\n- Number: ${incident.metadata.serviceNowNumber}\n- Priority: ${incident.metadata.priority}\n- State: ${incident.metadata.state}`;
      
      if (logContent) {
        knowledgeEntry.metadata.tags.push('log-analysis');
        knowledgeEntry.description += `\n\nLog Analysis Available: ${logContent.length} characters of log data analyzed`;
      }
    }
    
    const knowledge = await storage.createKnowledgeBaseEntry(knowledgeEntry);
    broadcast({ type: 'knowledge_created', data: knowledge });
    
    log(`Created knowledge base entry for incident ${incident.incidentId}`);
  } catch (error) {
    console.error(`Error updating knowledge base for incident ${incident.incidentId}:`, error);
  }
}

// Global error handlers to prevent unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Application specific logging, throwing an error, or other logic here
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // Application specific logging, throwing an error, or other logic here
});

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const { httpServer: server, broadcast: broadcastFunction } = await registerRoutes(app);
  broadcast = broadcastFunction; // Set broadcast function for use in polling

  // API-specific error handler
  app.use('/api/*', (err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error('API Error Handler:', err);
    res.status(status).json({ 
      error: message,
      timestamp: new Date().toISOString()
    });
  });

  // 404 handler for API routes
  app.use('/api/*', (_req: Request, res: Response) => {
    res.status(404).json({
      error: `API endpoint not found: ${_req.method} ${_req.path}`,
      timestamp: new Date().toISOString()
    });
  });

  // General error handler
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error('Express Error Handler:', err);
    res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on port 5000
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = 5000;
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
    // Start background polling services
    startBackgroundServices();
  });
})();

// Background polling services
function startBackgroundServices() {
  log("Starting background services...");
  
  // ServiceNow polling service
  startServiceNowPolling();
}

async function startServiceNowPolling() {
  const pollServiceNow = async () => {
    try {
      // Get ServiceNow configuration
      const config = await storage.getServiceNowConfiguration();
      
      if (!config || !config.isActive || !config.autoSync) {
        return; // Skip if not configured or disabled
      }
      
      // Initialize ServiceNow service
      const serviceNowService = new ServiceNowService(config);
      
      // Poll for incidents from the last 5 minutes
      const incidents = await serviceNowService.pollRecentIncidents(5);
      
      log(`ServiceNow: Polling completed, found ${incidents.length} incidents`);
      
      if (incidents.length > 0) {
        log(`ServiceNow: Processing ${incidents.length} incidents...`);
        
        // Process each incident
        for (const snIncident of incidents) {
          try {
            // Check if we already have this incident
            const existingIncident = await storage.getIncidentByIncidentId(snIncident.number);
            
            if (!existingIncident) {
              // Get incident with log content
              const incidentWithLogs = await serviceNowService.getIncidentWithLogs(snIncident.sys_id);
              
              // Create new incident in our system
              const newIncident = await storage.createIncident({
                incidentId: snIncident.number,
                title: snIncident.short_description,
                description: snIncident.description || snIncident.short_description,
                severity: mapServiceNowPriorityToSeverity(snIncident.priority),
                status: 'ACTIVE',
                startedAt: new Date(snIncident.opened_at),
                resolvedAt: null,
                aiConfidence: 0,
                currentStep: 0,
                totalSteps: 0,
                affectedSystems: [],
                metadata: {
                  source: 'ServiceNow',
                  serviceNowSysId: snIncident.sys_id,
                  serviceNowNumber: snIncident.number,
                  priority: snIncident.priority,
                  state: snIncident.state,
                  logContent: incidentWithLogs.logContent || ''
                }
              });
              
              // Create ServiceNow integration record
              await storage.createServiceNowIntegration({
                incidentId: newIncident.id,
                serviceNowSysId: snIncident.sys_id,
                serviceNowNumber: snIncident.number,
                state: snIncident.state || '1',
                priority: snIncident.priority || '3',
                urgency: snIncident.urgency || '3',
                assignedTo: snIncident.assigned_to?.display_value || null,
                callerId: snIncident.caller_id?.display_value || null,
                status: 'ACTIVE',
                syncStatus: 'SYNCED',
                lastSyncAt: new Date(),
                createdAt: new Date(),
                updatedAt: new Date(),
                metadata: {
                  lastSync: new Date().toISOString()
                }
              });
              
              log(`ServiceNow: Created incident ${newIncident.incidentId} from ServiceNow`);
              
              // Automatically start RCA workflow
              await startAutomaticRCAWorkflow(newIncident);
              
              // Automatically generate initial actions
              await generateInitialActions(newIncident);
              
              // Automatically update knowledge base
              await updateKnowledgeBase(newIncident);
              
              // Broadcast incident creation for real-time updates
              broadcast({ type: 'incident_created', data: newIncident });
              
              // Broadcast RCA workflow update
              const rcaWorkflows = await storage.getRcaWorkflowsByIncident(newIncident.id);
              broadcast({ type: 'rca_workflows_updated', data: rcaWorkflows });
              
              // Broadcast actions update
              const recentActions = await storage.getRecentActions(10);
              broadcast({ type: 'actions_updated', data: recentActions });
            }
          } catch (error) {
            console.error(`Error processing ServiceNow incident ${snIncident.number}:`, error);
          }
        }
      }
      
    } catch (error) {
      console.error('ServiceNow polling error:', error);
    }
  };
  
  // Initial poll
  setTimeout(pollServiceNow, 5000); // Start after 5 seconds
  
  // Set up interval polling
  setInterval(async () => {
    try {
      const config = await storage.getServiceNowConfiguration();
      log(`ServiceNow: Interval check - config exists: ${!!config}, isActive: ${config?.isActive}, autoSync: ${config?.autoSync}`);
      
      if (config?.isActive && config?.autoSync) {
        log('ServiceNow: Configuration allows polling, starting...');
        await pollServiceNow();
      } else {
        log('ServiceNow: Polling skipped - configuration not active or autoSync disabled');
      }
    } catch (error) {
      console.error('ServiceNow: Error in interval polling:', error);
    }
  }, 30000); // Check every 30 seconds
}
