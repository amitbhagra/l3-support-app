import { 
  users, incidents, rcaWorkflows, actions, knowledgeBaseEntries, escalations, systemMetrics,
  jiraIntegration, jiraConfiguration, documents, codeRepositories, documentSearchResults,
  serviceNowConfiguration, serviceNowIntegration,
  type User, type InsertUser, type Incident, type InsertIncident, 
  type RcaWorkflow, type InsertRcaWorkflow, type Action, type InsertAction,
  type KnowledgeBaseEntry, type InsertKnowledgeBaseEntry, type Escalation, type InsertEscalation,
  type SystemMetrics, type InsertSystemMetrics, type JiraIntegration, type InsertJiraIntegration,
  type JiraConfiguration, type InsertJiraConfiguration, type Document, type InsertDocument,
  type CodeRepository, type InsertCodeRepository, type DocumentSearchResult,
  type ServiceNowConfiguration, type InsertServiceNowConfiguration,
  type ServiceNowIntegration, type InsertServiceNowIntegration
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, sql } from "drizzle-orm";

export interface IStorage {
  // Users
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // Incidents
  getIncidents(): Promise<Incident[]>;
  getIncident(id: number): Promise<Incident | undefined>;
  getIncidentByIncidentId(incidentId: string): Promise<Incident | undefined>;
  createIncident(incident: InsertIncident): Promise<Incident>;
  updateIncident(id: number, updates: Partial<Incident>): Promise<Incident | undefined>;

  // RCA Workflows
  getRcaWorkflowsByIncident(incidentId: number): Promise<RcaWorkflow[]>;
  createRcaWorkflow(workflow: InsertRcaWorkflow): Promise<RcaWorkflow>;
  updateRcaWorkflow(id: number, updates: Partial<RcaWorkflow>): Promise<RcaWorkflow | undefined>;

  // Actions
  getActionsByIncident(incidentId: number): Promise<Action[]>;
  getRecentActions(limit: number): Promise<Action[]>;
  getAction(id: number): Promise<Action | undefined>;
  createAction(action: InsertAction): Promise<Action>;
  updateAction(id: number, updates: Partial<Action>): Promise<Action | undefined>;

  // Knowledge Base
  getKnowledgeBaseEntries(): Promise<KnowledgeBaseEntry[]>;
  createKnowledgeBaseEntry(entry: InsertKnowledgeBaseEntry): Promise<KnowledgeBaseEntry>;

  // Escalations
  getEscalations(): Promise<Escalation[]>;
  getEscalation(id: number): Promise<Escalation | undefined>;
  createEscalation(escalation: InsertEscalation): Promise<Escalation>;
  updateEscalation(id: number, updates: Partial<Escalation>): Promise<Escalation | undefined>;

  // System Metrics
  getSystemMetrics(): Promise<SystemMetrics | undefined>;
  updateSystemMetrics(metrics: InsertSystemMetrics): Promise<SystemMetrics>;

  // Jira Integration
  getJiraIntegrations(): Promise<JiraIntegration[]>;
  getJiraIntegrationByIncident(incidentId: number): Promise<JiraIntegration | undefined>;
  getJiraIntegrationByIssueKey(issueKey: string): Promise<JiraIntegration | undefined>;
  createJiraIntegration(integration: InsertJiraIntegration): Promise<JiraIntegration>;
  updateJiraIntegration(id: number, updates: Partial<JiraIntegration>): Promise<JiraIntegration | undefined>;

  // Jira Configuration
  getJiraConfiguration(): Promise<JiraConfiguration | undefined>;
  createJiraConfiguration(config: InsertJiraConfiguration): Promise<JiraConfiguration>;
  updateJiraConfiguration(id: number, updates: Partial<JiraConfiguration>): Promise<JiraConfiguration | undefined>;

  // Clear file-based data
  clearFileBasedData(): Promise<void>;
  
  // Clear all dashboard data
  clearAllData(): Promise<void>;
  
  // Clear specific data types
  clearIncidents(): Promise<void>;
  clearRcaWorkflows(): Promise<void>;
  clearActions(): Promise<void>;
  clearKnowledgeBase(): Promise<void>;
  clearServiceNowIntegrations(): Promise<void>;

  // Document Management
  getDocuments(): Promise<Document[]>;
  getDocument(id: number): Promise<Document | undefined>;
  createDocument(document: InsertDocument): Promise<Document>;
  updateDocument(id: number, updates: Partial<Document>): Promise<Document | undefined>;
  deleteDocument(id: number): Promise<void>;
  clearAllDocuments(): Promise<void>;

  // Code Repository Management
  getCodeRepositories(): Promise<CodeRepository[]>;
  getCodeRepository(id: number): Promise<CodeRepository | undefined>;
  createCodeRepository(repository: InsertCodeRepository): Promise<CodeRepository>;
  updateCodeRepository(id: number, updates: Partial<CodeRepository>): Promise<CodeRepository | undefined>;
  deleteCodeRepository(id: number): Promise<void>;
  clearAllRepositories(): Promise<void>;

  // Document Search and Analytics
  searchDocuments(query: string, limit?: number): Promise<DocumentSearchResult[]>;
  getDocumentSearchResults(incidentId: number): Promise<DocumentSearchResult[]>;
  markDocumentUsed(incidentId: number, documentId: number): Promise<void>;

  // ServiceNow Configuration
  getServiceNowConfiguration(): Promise<ServiceNowConfiguration | undefined>;
  createServiceNowConfiguration(config: InsertServiceNowConfiguration): Promise<ServiceNowConfiguration>;
  updateServiceNowConfiguration(updates: Partial<ServiceNowConfiguration>): Promise<ServiceNowConfiguration | undefined>;

  // ServiceNow Integration
  getServiceNowIntegrations(): Promise<ServiceNowIntegration[]>;
  getServiceNowIntegrationByIncident(incidentId: number): Promise<ServiceNowIntegration | undefined>;
  getServiceNowIntegrationByNumber(serviceNowNumber: string): Promise<ServiceNowIntegration | undefined>;
  createServiceNowIntegration(integration: InsertServiceNowIntegration): Promise<ServiceNowIntegration>;
  updateServiceNowIntegration(id: number, updates: Partial<ServiceNowIntegration>): Promise<ServiceNowIntegration | undefined>;
}

export class MemStorage implements IStorage {
  private users: Map<number, User> = new Map();
  private incidents: Map<number, Incident> = new Map();
  private rcaWorkflows: Map<number, RcaWorkflow> = new Map();
  private actions: Map<number, Action> = new Map();
  private knowledgeBaseEntries: Map<number, KnowledgeBaseEntry> = new Map();
  private escalations: Map<number, Escalation> = new Map();
  private systemMetrics: SystemMetrics | undefined;
  
  private currentUserId = 1;
  private currentIncidentId = 1;
  private currentRcaWorkflowId = 1;
  private currentActionId = 1;
  private currentKnowledgeBaseEntryId = 1;
  private currentEscalationId = 1;

  constructor() {
    this.initializeData();
  }

  private initializeData() {
    // Initialize with some sample data to demonstrate the system
    const now = new Date();
    
    // Create incidents
    const incident1: Incident = {
      id: this.currentIncidentId++,
      incidentId: "INC-2024-001",
      title: "Database Performance Degradation",
      description: "High CPU usage detected on prod-db-01. Response time increased by 300%.",
      severity: "CRITICAL",
      status: "ACTIVE",
      startedAt: new Date(now.getTime() - 15 * 60 * 1000), // 15 minutes ago
      resolvedAt: null,
      aiConfidence: 89,
      currentStep: 3,
      totalSteps: 6,
      affectedSystems: ["prod-db-01", "payment-service"],
      metadata: { region: "us-east-1", alert_source: "prometheus" }
    };

    const incident2: Incident = {
      id: this.currentIncidentId++,
      incidentId: "INC-2024-002",
      title: "API Gateway Timeout Issues",
      description: "Intermittent 504 errors affecting payment processing service.",
      severity: "HIGH",
      status: "ACTIVE",
      startedAt: new Date(now.getTime() - 8 * 60 * 1000), // 8 minutes ago
      resolvedAt: null,
      aiConfidence: 67,
      currentStep: 2,
      totalSteps: 6,
      affectedSystems: ["api-gateway", "payment-service"],
      metadata: { region: "us-west-2", alert_source: "datadog" }
    };

    const incident3: Incident = {
      id: this.currentIncidentId++,
      incidentId: "INC-2024-003",
      title: "Memory Leak in Auth Service",
      description: "Progressive memory consumption detected. Restart scheduled.",
      severity: "HIGH",
      status: "RESOLVING",
      startedAt: new Date(now.getTime() - 32 * 60 * 1000), // 32 minutes ago
      resolvedAt: null,
      aiConfidence: 94,
      currentStep: 5,
      totalSteps: 6,
      affectedSystems: ["auth-service-v2"],
      metadata: { region: "us-east-1", alert_source: "kubernetes" }
    };

    const incident4: Incident = {
      id: this.currentIncidentId++,
      incidentId: "INC-2024-004",
      title: "Database Performance Issue - Complex Query Timeout",
      description: "Database performance issue where running a complex select query is taking time, this query has more than 5 joins and none of the underlying table has any indexes",
      severity: "CRITICAL",
      status: "ACTIVE",
      startedAt: new Date(now.getTime() - 5 * 60 * 1000), // 5 minutes ago
      resolvedAt: null,
      aiConfidence: 78,
      currentStep: 3,
      totalSteps: 6,
      affectedSystems: ["prod-db-cluster", "reporting-service", "analytics-api"],
      metadata: { 
        region: "us-east-1", 
        alert_source: "database_monitor",
        query_execution_time: "45.7s",
        expected_time: "2.1s",
        tables_involved: ["orders", "customers", "products", "payments", "shipping", "reviews"],
        joins_count: 6,
        missing_indexes: ["orders.customer_id", "payments.order_id", "shipping.order_id", "reviews.product_id"]
      }
    };

    this.incidents.set(incident1.id, incident1);
    this.incidents.set(incident2.id, incident2);
    this.incidents.set(incident3.id, incident3);
    this.incidents.set(incident4.id, incident4);

    // Create RCA workflows
    const rcaSteps = [
      { step: 1, stepName: "Alert Detection", status: "COMPLETED", duration: 2 },
      { step: 2, stepName: "Data Collection", status: "COMPLETED", duration: 45 },
      { step: 3, stepName: "Root Cause Analysis", status: "IN_PROGRESS", duration: null },
      { step: 4, stepName: "Action Planning", status: "PENDING", duration: null },
      { step: 5, stepName: "Execution", status: "PENDING", duration: null },
      { step: 6, stepName: "Validation", status: "PENDING", duration: null }
    ];

    rcaSteps.forEach((step, index) => {
      const workflow: RcaWorkflow = {
        id: this.currentRcaWorkflowId++,
        incidentId: incident1.id,
        step: step.step,
        stepName: step.stepName,
        status: step.status,
        startedAt: step.status !== "PENDING" ? new Date(now.getTime() - (5 - index) * 60 * 1000) : null,
        completedAt: step.status === "COMPLETED" ? new Date(now.getTime() - (4 - index) * 60 * 1000) : null,
        duration: step.duration,
        details: step.step === 3 ? "Analyzing query patterns and index usage. Pattern detected: Full table scan on orders table. Missing index on created_at column." : `${step.stepName} details`,
        confidence: step.step === 3 ? 89 : null,
        metadata: {}
      };
      this.rcaWorkflows.set(workflow.id, workflow);
    });

    // Create RCA workflow for database performance incident
    const dbPerfRcaSteps = [
      { step: 1, stepName: "Alert Detection", status: "COMPLETED", duration: 1 },
      { step: 2, stepName: "Query Analysis", status: "COMPLETED", duration: 120 },
      { step: 3, stepName: "Index Assessment", status: "IN_PROGRESS", duration: null },
      { step: 4, stepName: "Performance Impact Analysis", status: "PENDING", duration: null },
      { step: 5, stepName: "Index Creation Planning", status: "PENDING", duration: null },
      { step: 6, stepName: "Validation & Monitoring", status: "PENDING", duration: null }
    ];

    dbPerfRcaSteps.forEach((step, index) => {
      const workflow: RcaWorkflow = {
        id: this.currentRcaWorkflowId++,
        incidentId: incident4.id,
        step: step.step,
        stepName: step.stepName,
        status: step.status,
        startedAt: step.status !== "PENDING" ? new Date(now.getTime() - (3 - index) * 60 * 1000) : null,
        completedAt: step.status === "COMPLETED" ? new Date(now.getTime() - (2 - index) * 60 * 1000) : null,
        duration: step.duration,
        details: step.step === 2 ? "Query involves 6 tables with complex joins. Execution plan shows full table scans on orders, customers, and payments tables." : 
                step.step === 3 ? "Analyzing missing indexes. Identified 4 critical missing indexes causing performance degradation." :
                `${step.stepName} in progress`,
        confidence: step.step === 3 ? 85 : step.step === 2 ? 92 : null,
        metadata: step.step === 2 ? { 
          tables_scanned: ["orders", "customers", "payments"],
          estimated_rows: 2500000,
          actual_execution_time: "45.7s"
        } : {}
      };
      this.rcaWorkflows.set(workflow.id, workflow);
    });

    // Create actions
    const action1: Action = {
      id: this.currentActionId++,
      incidentId: incident3.id,
      actionType: "SERVICE_RESTART",
      title: "Service Restart",
      description: "Restarted auth-service-v2 due to memory leak",
      status: "SUCCESS",
      executedAt: new Date(now.getTime() - 5 * 60 * 1000),
      target: "prod-k8s-01",
      metadata: { service: "auth-service-v2", namespace: "production" }
    };

    const action2: Action = {
      id: this.currentActionId++,
      incidentId: incident1.id,
      actionType: "INDEX_CREATION",
      title: "Index Creation",
      description: "Created index on orders.created_at column",
      status: "SUCCESS",
      executedAt: new Date(now.getTime() - 12 * 60 * 1000),
      target: "prod-mysql-01",
      metadata: { table: "orders", column: "created_at", index_type: "btree" }
    };

    const action3: Action = {
      id: this.currentActionId++,
      incidentId: 5,
      actionType: "ROLLBACK_DEPLOYMENT",
      title: "Rollback Deployment",
      description: "Rolled back api-gateway to v1.2.3 due to errors",
      status: "ROLLBACK",
      executedAt: new Date(now.getTime() - 60 * 60 * 1000),
      target: "staging-env",
      metadata: { service: "api-gateway", from_version: "v1.3.0", to_version: "v1.2.3" }
    };

    const action4: Action = {
      id: this.currentActionId++,
      incidentId: incident4.id,
      actionType: "INDEX_ANALYSIS",
      title: "Database Index Analysis",
      description: "Analyzing missing indexes for complex query optimization - identified 4 critical missing indexes",
      status: "SUCCESS",
      executedAt: new Date(now.getTime() - 2 * 60 * 1000),
      target: "prod-db-cluster",
      metadata: { 
        analysis_duration: "2m 15s",
        missing_indexes_found: 4,
        tables_analyzed: ["orders", "customers", "products", "payments", "shipping", "reviews"],
        recommended_indexes: [
          "CREATE INDEX idx_orders_customer_id ON orders(customer_id)",
          "CREATE INDEX idx_payments_order_id ON payments(order_id)", 
          "CREATE INDEX idx_shipping_order_id ON shipping(order_id)",
          "CREATE INDEX idx_reviews_product_id ON reviews(product_id)"
        ]
      }
    };

    this.actions.set(action1.id, action1);
    this.actions.set(action2.id, action2);
    this.actions.set(action3.id, action3);
    this.actions.set(action4.id, action4);

    // Create knowledge base entries
    const kb1: KnowledgeBaseEntry = {
      id: this.currentKnowledgeBaseEntryId++,
      title: "New Pattern Identified",
      description: "Database performance issues correlate with order processing spikes during peak hours",
      type: "PATTERN",
      confidence: 92,
      updatedAt: new Date(now.getTime() - 30 * 60 * 1000),
      metadata: { correlation_strength: 0.89, peak_hours: ["12:00-14:00", "18:00-20:00"] }
    };

    const kb2: KnowledgeBaseEntry = {
      id: this.currentKnowledgeBaseEntryId++,
      title: "Solution Added",
      description: "Memory leak detection and auto-restart procedure for auth services",
      type: "SOLUTION",
      confidence: 95,
      updatedAt: new Date(now.getTime() - 60 * 60 * 1000),
      metadata: { auto_generated: true, success_rate: 0.98 }
    };

    const kb3: KnowledgeBaseEntry = {
      id: this.currentKnowledgeBaseEntryId++,
      title: "Escalation Trigger",
      description: "Network issues require human intervention when affecting multiple regions",
      type: "ESCALATION_TRIGGER",
      confidence: 100,
      updatedAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
      metadata: { policy_updated: true, trigger_threshold: 2 }
    };

    const kb4: KnowledgeBaseEntry = {
      id: this.currentKnowledgeBaseEntryId++,
      title: "Database Performance - Missing Index Pattern",
      description: "Complex queries with multiple joins (>5) and missing indexes cause significant performance degradation. Solution: Analyze execution plan and create strategic indexes.",
      type: "SOLUTION",
      confidence: 89,
      updatedAt: new Date(now.getTime() - 3 * 60 * 1000),
      metadata: { 
        pattern_type: "database_performance",
        symptoms: ["slow_queries", "high_cpu", "table_scans"],
        solution_steps: ["analyze_execution_plan", "identify_missing_indexes", "create_indexes", "validate_performance"],
        effectiveness_rating: 95
      }
    };

    this.knowledgeBaseEntries.set(kb1.id, kb1);
    this.knowledgeBaseEntries.set(kb2.id, kb2);
    this.knowledgeBaseEntries.set(kb3.id, kb3);
    this.knowledgeBaseEntries.set(kb4.id, kb4);

    // Create escalation
    const escalation1: Escalation = {
      id: this.currentEscalationId++,
      incidentId: 4,
      title: "Multi-Region Connectivity Issues",
      description: "Complex network routing issues affecting multiple AWS regions. AI confidence too low for autonomous resolution.",
      reason: "AI confidence below threshold (31%)",
      status: "PENDING",
      escalatedAt: new Date(now.getTime() - 25 * 60 * 1000),
      aiAnalysis: "BGP routing inconsistencies detected in us-east-1 and eu-west-1 regions. Network topology changes required.",
      recommendedActions: [
        "Contact network infrastructure team",
        "Review recent routing changes", 
        "Escalate to AWS support if needed",
        "Monitor cross-region latency"
      ],
      assignedTo: null,
      impact: "HIGH",
      affectedServices: 12
    };

    this.escalations.set(escalation1.id, escalation1);

    // Initialize system metrics
    this.systemMetrics = {
      id: 1,
      activeIncidents: 12,
      resolvedToday: 47,
      avgResolutionTime: 23,
      aiConfidence: 94,
      updatedAt: new Date(now.getTime() - 2 * 60 * 1000)
    };
  }

  // User methods
  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(user => user.username === username);
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const user: User = { ...insertUser, id: this.currentUserId++ };
    this.users.set(user.id, user);
    return user;
  }

  // Incident methods
  async getIncidents(): Promise<Incident[]> {
    return Array.from(this.incidents.values()).sort((a, b) => 
      new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
    );
  }

  async getIncident(id: number): Promise<Incident | undefined> {
    return this.incidents.get(id);
  }

  async getIncidentByIncidentId(incidentId: string): Promise<Incident | undefined> {
    return Array.from(this.incidents.values()).find(incident => incident.incidentId === incidentId);
  }

  async createIncident(insertIncident: InsertIncident): Promise<Incident> {
    const incident: Incident = {
      ...insertIncident,
      id: this.currentIncidentId++,
      startedAt: new Date(),
      resolvedAt: null
    };
    this.incidents.set(incident.id, incident);
    return incident;
  }

  async updateIncident(id: number, updates: Partial<Incident>): Promise<Incident | undefined> {
    const incident = this.incidents.get(id);
    if (!incident) return undefined;
    
    const updatedIncident = { ...incident, ...updates };
    this.incidents.set(id, updatedIncident);
    return updatedIncident;
  }

  // RCA Workflow methods
  async getRcaWorkflowsByIncident(incidentId: number): Promise<RcaWorkflow[]> {
    return Array.from(this.rcaWorkflows.values())
      .filter(workflow => workflow.incidentId === incidentId)
      .sort((a, b) => a.step - b.step);
  }

  async createRcaWorkflow(insertWorkflow: InsertRcaWorkflow): Promise<RcaWorkflow> {
    const workflow: RcaWorkflow = {
      ...insertWorkflow,
      id: this.currentRcaWorkflowId++,
      startedAt: null,
      completedAt: null
    };
    this.rcaWorkflows.set(workflow.id, workflow);
    return workflow;
  }

  async updateRcaWorkflow(id: number, updates: Partial<RcaWorkflow>): Promise<RcaWorkflow | undefined> {
    const workflow = this.rcaWorkflows.get(id);
    if (!workflow) return undefined;
    
    const updatedWorkflow = { ...workflow, ...updates };
    this.rcaWorkflows.set(id, updatedWorkflow);
    return updatedWorkflow;
  }

  // Action methods
  async getActionsByIncident(incidentId: number): Promise<Action[]> {
    return Array.from(this.actions.values())
      .filter(action => action.incidentId === incidentId)
      .sort((a, b) => new Date(b.executedAt).getTime() - new Date(a.executedAt).getTime());
  }

  async getRecentActions(limit: number = 10): Promise<Action[]> {
    return Array.from(this.actions.values())
      .sort((a, b) => new Date(b.executedAt).getTime() - new Date(a.executedAt).getTime())
      .slice(0, limit);
  }

  async getAction(id: number): Promise<Action | undefined> {
    return this.actions.get(id);
  }

  async createAction(insertAction: InsertAction): Promise<Action> {
    const action: Action = {
      ...insertAction,
      id: this.currentActionId++,
      executedAt: new Date()
    };
    this.actions.set(action.id, action);
    return action;
  }

  async updateAction(id: number, updates: Partial<Action>): Promise<Action | undefined> {
    const action = this.actions.get(id);
    if (!action) return undefined;
    
    const updatedAction = { ...action, ...updates };
    this.actions.set(id, updatedAction);
    return updatedAction;
  }

  // Knowledge Base methods
  async getKnowledgeBaseEntries(): Promise<KnowledgeBaseEntry[]> {
    return Array.from(this.knowledgeBaseEntries.values())
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  async createKnowledgeBaseEntry(insertEntry: InsertKnowledgeBaseEntry): Promise<KnowledgeBaseEntry> {
    const entry: KnowledgeBaseEntry = {
      ...insertEntry,
      id: this.currentKnowledgeBaseEntryId++,
      updatedAt: new Date()
    };
    this.knowledgeBaseEntries.set(entry.id, entry);
    return entry;
  }

  // Escalation methods
  async getEscalations(): Promise<Escalation[]> {
    return Array.from(this.escalations.values())
      .sort((a, b) => new Date(b.escalatedAt).getTime() - new Date(a.escalatedAt).getTime());
  }

  async getEscalation(id: number): Promise<Escalation | undefined> {
    return this.escalations.get(id);
  }

  async createEscalation(insertEscalation: InsertEscalation): Promise<Escalation> {
    const escalation: Escalation = {
      ...insertEscalation,
      id: this.currentEscalationId++,
      escalatedAt: new Date()
    };
    this.escalations.set(escalation.id, escalation);
    return escalation;
  }

  async updateEscalation(id: number, updates: Partial<Escalation>): Promise<Escalation | undefined> {
    const escalation = this.escalations.get(id);
    if (!escalation) return undefined;
    
    const updatedEscalation = { ...escalation, ...updates };
    this.escalations.set(id, updatedEscalation);
    return updatedEscalation;
  }

  // System Metrics methods
  async getSystemMetrics(): Promise<SystemMetrics | undefined> {
    return this.systemMetrics;
  }

  async updateSystemMetrics(insertMetrics: InsertSystemMetrics): Promise<SystemMetrics> {
    this.systemMetrics = {
      ...insertMetrics,
      id: 1,
      updatedAt: new Date()
    };
    return this.systemMetrics;
  }
}

export class DatabaseStorage implements IStorage {
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(insertUser)
      .returning();
    return user;
  }

  async getIncidents(): Promise<Incident[]> {
    return await db.select().from(incidents);
  }

  async getIncident(id: number): Promise<Incident | undefined> {
    const [incident] = await db.select().from(incidents).where(eq(incidents.id, id));
    return incident || undefined;
  }

  async getIncidentByIncidentId(incidentId: string): Promise<Incident | undefined> {
    const [incident] = await db.select().from(incidents).where(eq(incidents.incidentId, incidentId));
    return incident || undefined;
  }

  async createIncident(insertIncident: InsertIncident): Promise<Incident> {
    const [incident] = await db
      .insert(incidents)
      .values({
        ...insertIncident,
        startedAt: new Date(),
      })
      .returning();
    return incident;
  }

  async updateIncident(id: number, updates: Partial<Incident>): Promise<Incident | undefined> {
    const [incident] = await db
      .update(incidents)
      .set(updates)
      .where(eq(incidents.id, id))
      .returning();
    return incident || undefined;
  }

  async getRcaWorkflowsByIncident(incidentId: number): Promise<RcaWorkflow[]> {
    return await db.select().from(rcaWorkflows).where(eq(rcaWorkflows.incidentId, incidentId));
  }

  async createRcaWorkflow(insertWorkflow: InsertRcaWorkflow): Promise<RcaWorkflow> {
    const [workflow] = await db
      .insert(rcaWorkflows)
      .values(insertWorkflow)
      .returning();
    return workflow;
  }

  async updateRcaWorkflow(id: number, updates: Partial<RcaWorkflow>): Promise<RcaWorkflow | undefined> {
    const [workflow] = await db
      .update(rcaWorkflows)
      .set(updates)
      .where(eq(rcaWorkflows.id, id))
      .returning();
    return workflow || undefined;
  }

  async getActionsByIncident(incidentId: number): Promise<Action[]> {
    return await db.select().from(actions).where(eq(actions.incidentId, incidentId));
  }

  async getRecentActions(limit: number = 10): Promise<Action[]> {
    return await db.select().from(actions).orderBy(desc(actions.id)).limit(limit);
  }

  async getAction(id: number): Promise<Action | undefined> {
    const [action] = await db.select().from(actions).where(eq(actions.id, id));
    return action || undefined;
  }

  async createAction(insertAction: InsertAction): Promise<Action> {
    const [action] = await db
      .insert(actions)
      .values({
        ...insertAction,
        executedAt: new Date(),
      })
      .returning();
    return action;
  }

  async updateAction(id: number, updates: Partial<Action>): Promise<Action | undefined> {
    const [action] = await db
      .update(actions)
      .set(updates)
      .where(eq(actions.id, id))
      .returning();
    return action || undefined;
  }

  async getKnowledgeBaseEntries(): Promise<KnowledgeBaseEntry[]> {
    return await db.select().from(knowledgeBaseEntries);
  }

  async createKnowledgeBaseEntry(insertEntry: InsertKnowledgeBaseEntry): Promise<KnowledgeBaseEntry> {
    const [entry] = await db
      .insert(knowledgeBaseEntries)
      .values({
        ...insertEntry,
        updatedAt: new Date(),
      })
      .returning();
    return entry;
  }

  async getEscalations(): Promise<Escalation[]> {
    return await db.select().from(escalations);
  }

  async getEscalation(id: number): Promise<Escalation | undefined> {
    const [escalation] = await db.select().from(escalations).where(eq(escalations.id, id));
    return escalation || undefined;
  }

  async createEscalation(insertEscalation: InsertEscalation): Promise<Escalation> {
    const [escalation] = await db
      .insert(escalations)
      .values(insertEscalation)
      .returning();
    return escalation;
  }

  async updateEscalation(id: number, updates: Partial<Escalation>): Promise<Escalation | undefined> {
    const [escalation] = await db
      .update(escalations)
      .set(updates)
      .where(eq(escalations.id, id))
      .returning();
    return escalation || undefined;
  }

  async getSystemMetrics(): Promise<SystemMetrics | undefined> {
    const [metrics] = await db.select().from(systemMetrics);
    return metrics || undefined;
  }

  async updateSystemMetrics(insertMetrics: InsertSystemMetrics): Promise<SystemMetrics> {
    // First check if any metrics exist
    const existing = await this.getSystemMetrics();
    if (existing) {
      // Update existing record
      const [metrics] = await db
        .update(systemMetrics)
        .set(insertMetrics)
        .where(eq(systemMetrics.id, existing.id))
        .returning();
      return metrics;
    } else {
      // Insert new record
      const [metrics] = await db
        .insert(systemMetrics)
        .values(insertMetrics)
        .returning();
      return metrics;
    }
  }

  // Jira Integration Methods
  async getJiraIntegrations(): Promise<JiraIntegration[]> {
    return await db.select().from(jiraIntegration);
  }

  async getJiraIntegrationByIncident(incidentId: number): Promise<JiraIntegration | undefined> {
    const [integration] = await db.select().from(jiraIntegration).where(eq(jiraIntegration.incidentId, incidentId));
    return integration || undefined;
  }

  async getJiraIntegrationByIssueKey(issueKey: string): Promise<JiraIntegration | undefined> {
    const [integration] = await db.select().from(jiraIntegration).where(eq(jiraIntegration.jiraIssueKey, issueKey));
    return integration || undefined;
  }

  async createJiraIntegration(insertIntegration: InsertJiraIntegration): Promise<JiraIntegration> {
    const [integration] = await db
      .insert(jiraIntegration)
      .values({
        ...insertIntegration,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSyncAt: new Date()
      })
      .returning();
    return integration;
  }

  async updateJiraIntegration(id: number, updates: Partial<JiraIntegration>): Promise<JiraIntegration | undefined> {
    const [integration] = await db
      .update(jiraIntegration)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(jiraIntegration.id, id))
      .returning();
    return integration || undefined;
  }

  // Jira Configuration Methods
  async getJiraConfiguration(): Promise<JiraConfiguration | undefined> {
    const [config] = await db.select().from(jiraConfiguration).where(eq(jiraConfiguration.isActive, true));
    return config || undefined;
  }

  async createJiraConfiguration(insertConfig: InsertJiraConfiguration): Promise<JiraConfiguration> {
    // Deactivate existing configurations
    await db
      .update(jiraConfiguration)
      .set({ isActive: false, updatedAt: new Date() });

    const [config] = await db
      .insert(jiraConfiguration)
      .values({
        ...insertConfig,
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning();
    return config;
  }

  async updateJiraConfiguration(id: number, updates: Partial<JiraConfiguration>): Promise<JiraConfiguration | undefined> {
    const [config] = await db
      .update(jiraConfiguration)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(jiraConfiguration.id, id))
      .returning();
    return config || undefined;
  }

  async clearFileBasedData(): Promise<void> {
    // Delete incidents that came from file uploads (have "ALERT-" prefix in incidentId)
    await db.delete(incidents).where(sql`incident_id LIKE 'ALERT-%'`);
    
    // Delete RCA workflows for file-based incidents
    await db.delete(rcaWorkflows).where(sql`metadata->>'source' = 'file_upload'`);
    
    // Delete actions for file-based incidents 
    await db.delete(actions).where(sql`metadata->>'source' = 'uploaded_file'`);
    
    // Delete knowledge base entries created from file uploads
    await db.delete(knowledgeBaseEntries).where(sql`title = 'File-Based Alert Processing'`);
  }

  async clearAllData(): Promise<void> {
    // Delete in correct order to respect foreign key constraints
    // Delete child records first, then parent records
    
    // Delete all actions (references incidents)
    await db.delete(actions);
    
    // Delete all RCA workflows (references incidents)
    await db.delete(rcaWorkflows);
    
    // Delete all escalations (references incidents)
    await db.delete(escalations);
    
    // Delete all Jira integrations (references incidents)
    await db.delete(jiraIntegration);
    
    // Delete all knowledge base entries (no foreign keys)
    await db.delete(knowledgeBaseEntries);
    
    // Delete all system metrics (no foreign keys)
    await db.delete(systemMetrics);
    
    // Delete all incidents (parent table)
    await db.delete(incidents);
    
    // Delete all Jira integrations
    await db.delete(jiraIntegration);
    
    // Delete all Jira configurations
    await db.delete(jiraConfiguration);
  }

  // Document Management
  async getDocuments(): Promise<Document[]> {
    return await db.select().from(documents).where(eq(documents.isActive, true)).orderBy(desc(documents.lastUpdated));
  }

  async getDocument(id: number): Promise<Document | undefined> {
    const [document] = await db.select().from(documents).where(eq(documents.id, id));
    return document;
  }

  async createDocument(insertDocument: InsertDocument): Promise<Document> {
    const [document] = await db
      .insert(documents)
      .values({
        ...insertDocument,
        lastUpdated: new Date(),
      })
      .returning();
    return document;
  }

  async updateDocument(id: number, updates: Partial<Document>): Promise<Document | undefined> {
    const [document] = await db
      .update(documents)
      .set({
        ...updates,
        lastUpdated: new Date(),
      })
      .where(eq(documents.id, id))
      .returning();
    return document;
  }

  async deleteDocument(id: number): Promise<void> {
    await db.update(documents).set({ isActive: false }).where(eq(documents.id, id));
  }

  async clearAllDocuments(): Promise<void> {
    await db.update(documents).set({ isActive: false });
  }

  // Code Repository Management
  async getCodeRepositories(): Promise<CodeRepository[]> {
    return await db.select().from(codeRepositories).where(eq(codeRepositories.isActive, true));
  }

  async getCodeRepository(id: number): Promise<CodeRepository | undefined> {
    const [repository] = await db.select().from(codeRepositories).where(eq(codeRepositories.id, id));
    return repository;
  }

  async createCodeRepository(insertRepository: InsertCodeRepository): Promise<CodeRepository> {
    const [repository] = await db
      .insert(codeRepositories)
      .values(insertRepository)
      .returning();
    return repository;
  }

  async updateCodeRepository(id: number, updates: Partial<CodeRepository>): Promise<CodeRepository | undefined> {
    const [repository] = await db
      .update(codeRepositories)
      .set(updates)
      .where(eq(codeRepositories.id, id))
      .returning();
    return repository;
  }

  async deleteCodeRepository(id: number): Promise<void> {
    await db.update(codeRepositories).set({ isActive: false }).where(eq(codeRepositories.id, id));
  }

  async clearAllRepositories(): Promise<void> {
    await db.update(codeRepositories).set({ isActive: false });
  }

  // Document Search and Analytics
  async searchDocuments(query: string, limit: number = 10): Promise<DocumentSearchResult[]> {
    // Basic text search for now - can be enhanced with full-text search
    return await db
      .select()
      .from(documentSearchResults)
      .where(sql`${documentSearchResults.searchQuery} ILIKE ${'%' + query + '%'}`)
      .limit(limit);
  }

  async getDocumentSearchResults(incidentId: number): Promise<DocumentSearchResult[]> {
    return await db
      .select()
      .from(documentSearchResults)
      .where(eq(documentSearchResults.incidentId, incidentId));
  }

  async markDocumentUsed(incidentId: number, documentId: number): Promise<void> {
    await db
      .update(documentSearchResults)
      .set({ usedInSolution: true })
      .where(sql`${documentSearchResults.incidentId} = ${incidentId} AND ${documentSearchResults.documentId} = ${documentId}`);
  }

  // ServiceNow Configuration
  async getServiceNowConfiguration(): Promise<ServiceNowConfiguration | undefined> {
    const [config] = await db.select().from(serviceNowConfiguration).limit(1);
    return config || undefined;
  }

  async createServiceNowConfiguration(config: InsertServiceNowConfiguration): Promise<ServiceNowConfiguration> {
    const [createdConfig] = await db
      .insert(serviceNowConfiguration)
      .values(config)
      .returning();
    return createdConfig;
  }

  async updateServiceNowConfiguration(updates: Partial<ServiceNowConfiguration>): Promise<ServiceNowConfiguration | undefined> {
    const config = await this.getServiceNowConfiguration();
    if (!config) {
      throw new Error('ServiceNow configuration not found');
    }
    
    const [updatedConfig] = await db
      .update(serviceNowConfiguration)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(serviceNowConfiguration.id, config.id))
      .returning();
    return updatedConfig || undefined;
  }

  // ServiceNow Integration
  async getServiceNowIntegrations(): Promise<ServiceNowIntegration[]> {
    return await db.select().from(serviceNowIntegration);
  }

  async getServiceNowIntegrationByIncident(incidentId: number): Promise<ServiceNowIntegration | undefined> {
    const [integration] = await db
      .select()
      .from(serviceNowIntegration)
      .where(eq(serviceNowIntegration.incidentId, incidentId));
    return integration || undefined;
  }

  async getServiceNowIntegrationByNumber(serviceNowNumber: string): Promise<ServiceNowIntegration | undefined> {
    const [integration] = await db
      .select()
      .from(serviceNowIntegration)
      .where(eq(serviceNowIntegration.serviceNowNumber, serviceNowNumber));
    return integration || undefined;
  }

  async createServiceNowIntegration(integration: InsertServiceNowIntegration): Promise<ServiceNowIntegration> {
    const [createdIntegration] = await db
      .insert(serviceNowIntegration)
      .values(integration)
      .returning();
    return createdIntegration;
  }

  async updateServiceNowIntegration(id: number, updates: Partial<ServiceNowIntegration>): Promise<ServiceNowIntegration | undefined> {
    const [updatedIntegration] = await db
      .update(serviceNowIntegration)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(serviceNowIntegration.id, id))
      .returning();
    return updatedIntegration || undefined;
  }

  // Clear methods implementation
  async clearFileBasedData(): Promise<void> {
    // This method was from the MemStorage, keeping for compatibility
    console.log('DatabaseStorage: clearFileBasedData called (no-op)');
  }

  async clearAllData(): Promise<void> {
    // Clear in order to respect foreign key constraints
    await db.delete(actions);
    await db.delete(rcaWorkflows);
    await db.delete(documentSearchResults);
    await db.delete(serviceNowIntegration);
    await db.delete(jiraIntegration);
    await db.delete(incidents);
    await db.delete(knowledgeBaseEntries);
    await db.delete(escalations);
    await db.delete(documents);
    await db.delete(codeRepositories);
    console.log('All dashboard data cleared');
  }

  async clearIncidents(): Promise<void> {
    await db.delete(incidents);
    console.log('All incidents cleared');
  }

  async clearRcaWorkflows(): Promise<void> {
    await db.delete(rcaWorkflows);
    console.log('All RCA workflows cleared');
  }

  async clearActions(): Promise<void> {
    await db.delete(actions);
    console.log('All actions cleared');
  }

  async clearKnowledgeBase(): Promise<void> {
    await db.delete(knowledgeBaseEntries);
    console.log('All knowledge base entries cleared');
  }

  async clearServiceNowIntegrations(): Promise<void> {
    await db.delete(serviceNowIntegration);
    console.log('All ServiceNow integrations cleared');
  }
}

export const storage = new DatabaseStorage();
