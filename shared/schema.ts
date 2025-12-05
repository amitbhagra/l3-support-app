import { pgTable, text, serial, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const incidents = pgTable("incidents", {
  id: serial("id").primaryKey(),
  incidentId: text("incident_id").notNull().unique(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  severity: text("severity").notNull(), // CRITICAL, HIGH, MEDIUM, LOW
  status: text("status").notNull(), // ACTIVE, RESOLVING, RESOLVED, ESCALATED
  startedAt: timestamp("started_at").notNull(),
  resolvedAt: timestamp("resolved_at"),
  aiConfidence: integer("ai_confidence").default(0),
  currentStep: integer("current_step").default(1),
  totalSteps: integer("total_steps").default(6),
  affectedSystems: text("affected_systems").array(),
  metadata: jsonb("metadata"),
});

export const rcaWorkflows = pgTable("rca_workflows", {
  id: serial("id").primaryKey(),
  incidentId: integer("incident_id").references(() => incidents.id),
  step: integer("step").notNull(),
  stepName: text("step_name").notNull(),
  status: text("status").notNull(), // PENDING, IN_PROGRESS, COMPLETED, FAILED
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  duration: integer("duration"), // in seconds
  details: text("details"),
  confidence: integer("confidence"),
  metadata: jsonb("metadata"),
});

export const actions = pgTable("actions", {
  id: serial("id").primaryKey(),
  incidentId: integer("incident_id").references(() => incidents.id),
  actionType: text("action_type").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  status: text("status").notNull(), // SUCCESS, FAILED, ROLLBACK
  executedAt: timestamp("executed_at").notNull(),
  target: text("target").notNull(),
  metadata: jsonb("metadata"),
});

export const knowledgeBaseEntries = pgTable("knowledge_base_entries", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  type: text("type").notNull(), // PATTERN, SOLUTION, ESCALATION_TRIGGER
  confidence: integer("confidence").default(0),
  updatedAt: timestamp("updated_at").notNull(),
  metadata: jsonb("metadata"),
});

export const escalations = pgTable("escalations", {
  id: serial("id").primaryKey(),
  incidentId: integer("incident_id").references(() => incidents.id),
  title: text("title").notNull(),
  description: text("description").notNull(),
  reason: text("reason").notNull(),
  status: text("status").notNull(), // PENDING, ACCEPTED, ASSIGNED, RESOLVED
  escalatedAt: timestamp("escalated_at").notNull(),
  aiAnalysis: text("ai_analysis"),
  recommendedActions: text("recommended_actions").array(),
  assignedTo: text("assigned_to"),
  impact: text("impact").notNull(), // HIGH, MEDIUM, LOW
  affectedServices: integer("affected_services").default(0),
});

export const systemMetrics = pgTable("system_metrics", {
  id: serial("id").primaryKey(),
  activeIncidents: integer("active_incidents").default(0),
  resolvedToday: integer("resolved_today").default(0),
  avgResolutionTime: integer("avg_resolution_time").default(0), // in minutes
  aiConfidence: integer("ai_confidence").default(0),
  updatedAt: timestamp("updated_at").notNull(),
});

export const jiraIntegration = pgTable("jira_integration", {
  id: serial("id").primaryKey(),
  incidentId: integer("incident_id").references(() => incidents.id),
  jiraIssueKey: text("jira_issue_key").notNull().unique(),
  jiraIssueId: text("jira_issue_id").notNull(),
  projectKey: text("project_key").notNull(),
  issueType: text("issue_type").notNull(),
  priority: text("priority").notNull(),
  status: text("status").notNull(),
  assignee: text("assignee"),
  reporter: text("reporter").notNull(),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
  syncStatus: text("sync_status").notNull(), // SYNCED, PENDING, FAILED
  lastSyncAt: timestamp("last_sync_at"),
  metadata: jsonb("metadata"),
});

export const jiraConfiguration = pgTable("jira_configuration", {
  id: serial("id").primaryKey(),
  domain: text("domain").notNull(), // e.g., "mycompany.atlassian.net"
  email: text("email").notNull(),
  projectKey: text("project_key").notNull(),
  issueTypeMapping: jsonb("issue_type_mapping"), // Maps severity to Jira issue types
  priorityMapping: jsonb("priority_mapping"), // Maps severity to Jira priorities
  customFields: jsonb("custom_fields"), // Custom field mappings
  autoSync: boolean("auto_sync").default(true),
  syncInterval: integer("sync_interval").default(300), // seconds
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

// ServiceNow integration configuration
export const serviceNowConfiguration = pgTable("servicenow_configuration", {
  id: serial("id").primaryKey(),
  instance: text("instance").notNull(), // e.g., "mycompany"
  username: text("username").notNull(),
  assignmentGroup: text("assignment_group"),
  callerId: text("caller_id"),
  priorityMapping: jsonb("priority_mapping"), // Maps severity to ServiceNow priorities
  urgencyMapping: jsonb("urgency_mapping"), // Maps severity to ServiceNow urgencies
  customFields: jsonb("custom_fields"), // Custom field mappings
  autoSync: boolean("auto_sync").default(true),
  syncInterval: integer("sync_interval").default(300), // seconds
  pollInterval: integer("poll_interval").default(60), // seconds for active alerts polling
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

// ServiceNow integration tracking
export const serviceNowIntegration = pgTable("servicenow_integration", {
  id: serial("id").primaryKey(),
  incidentId: integer("incident_id").references(() => incidents.id),
  serviceNowNumber: text("servicenow_number").notNull().unique(),
  serviceNowSysId: text("servicenow_sys_id").notNull(),
  state: text("state").notNull(),
  priority: text("priority").notNull(),
  urgency: text("urgency").notNull(),
  assignedTo: text("assigned_to"),
  callerId: text("caller_id"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
  syncStatus: text("sync_status").notNull(), // SYNCED, PENDING, FAILED
  lastSyncAt: timestamp("last_sync_at"),
  metadata: jsonb("metadata"),
});

// Document storage for RAG system
export const documents = pgTable("documents", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  type: text("type").notNull(), // API_DOC, TROUBLESHOOTING, RUNBOOK, README, CONFIG
  filePath: text("file_path"),
  repositoryUrl: text("repository_url"),
  branch: text("branch").default("main"),
  lastUpdated: timestamp("last_updated").notNull(),
  metadata: jsonb("metadata"),
  tags: text("tags").array(),
  isActive: boolean("is_active").default(true),
});

// Code repository integration
export const codeRepositories = pgTable("code_repositories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  url: text("url").notNull(),
  branch: text("branch").default("main"),
  accessToken: text("access_token"),
  lastSyncAt: timestamp("last_sync_at"),
  isActive: boolean("is_active").default(true),
  syncStatus: text("sync_status").default("PENDING"), // PENDING, SYNCING, COMPLETED, FAILED
  metadata: jsonb("metadata"),
});

// Document embeddings for semantic search
export const documentEmbeddings = pgTable("document_embeddings", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").references(() => documents.id),
  chunkIndex: integer("chunk_index").notNull(),
  content: text("content").notNull(),
  embedding: text("embedding").notNull(), // JSON string of embedding vector
  metadata: jsonb("metadata"),
});

// Document search results for tracking relevance
export const documentSearchResults = pgTable("document_search_results", {
  id: serial("id").primaryKey(),
  incidentId: integer("incident_id").references(() => incidents.id),
  documentId: integer("document_id").references(() => documents.id),
  relevanceScore: integer("relevance_score").notNull(),
  usedInSolution: boolean("used_in_solution").default(false),
  searchQuery: text("search_query").notNull(),
  searchedAt: timestamp("searched_at").notNull(),
});

// Insert schemas
export const insertIncidentSchema = createInsertSchema(incidents).omit({
  id: true,
  startedAt: true,
  resolvedAt: true,
});

export const insertRcaWorkflowSchema = createInsertSchema(rcaWorkflows).omit({
  id: true,
  startedAt: true,
  completedAt: true,
});

export const insertActionSchema = createInsertSchema(actions).omit({
  id: true,
  executedAt: true,
});

export const insertKnowledgeBaseEntrySchema = createInsertSchema(knowledgeBaseEntries).omit({
  id: true,
  updatedAt: true,
});

export const insertEscalationSchema = createInsertSchema(escalations).omit({
  id: true,
  escalatedAt: true,
});

export const insertSystemMetricsSchema = createInsertSchema(systemMetrics).omit({
  id: true,
  updatedAt: true,
});

export const insertJiraIntegrationSchema = createInsertSchema(jiraIntegration).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastSyncAt: true,
});

export const insertJiraConfigurationSchema = createInsertSchema(jiraConfiguration).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertDocumentSchema = createInsertSchema(documents).omit({
  id: true,
  lastUpdated: true,
});

export const insertCodeRepositorySchema = createInsertSchema(codeRepositories).omit({
  id: true,
  lastSyncAt: true,
});

export const insertDocumentEmbeddingSchema = createInsertSchema(documentEmbeddings).omit({
  id: true,
});

export const insertDocumentSearchResultSchema = createInsertSchema(documentSearchResults).omit({
  id: true,
  searchedAt: true,
});

export const insertServiceNowConfigurationSchema = createInsertSchema(serviceNowConfiguration).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertServiceNowIntegrationSchema = createInsertSchema(serviceNowIntegration).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastSyncAt: true,
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

// Types
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type Incident = typeof incidents.$inferSelect;
export type InsertIncident = z.infer<typeof insertIncidentSchema>;
export type RcaWorkflow = typeof rcaWorkflows.$inferSelect;
export type InsertRcaWorkflow = z.infer<typeof insertRcaWorkflowSchema>;
export type Action = typeof actions.$inferSelect;
export type InsertAction = z.infer<typeof insertActionSchema>;
export type KnowledgeBaseEntry = typeof knowledgeBaseEntries.$inferSelect;
export type InsertKnowledgeBaseEntry = z.infer<typeof insertKnowledgeBaseEntrySchema>;
export type Escalation = typeof escalations.$inferSelect;
export type InsertEscalation = z.infer<typeof insertEscalationSchema>;
export type SystemMetrics = typeof systemMetrics.$inferSelect;
export type InsertSystemMetrics = z.infer<typeof insertSystemMetricsSchema>;
export type JiraIntegration = typeof jiraIntegration.$inferSelect;
export type InsertJiraIntegration = z.infer<typeof insertJiraIntegrationSchema>;
export type JiraConfiguration = typeof jiraConfiguration.$inferSelect;
export type InsertJiraConfiguration = z.infer<typeof insertJiraConfigurationSchema>;
export type Document = typeof documents.$inferSelect;
export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type CodeRepository = typeof codeRepositories.$inferSelect;
export type InsertCodeRepository = z.infer<typeof insertCodeRepositorySchema>;
export type DocumentEmbedding = typeof documentEmbeddings.$inferSelect;
export type InsertDocumentEmbedding = z.infer<typeof insertDocumentEmbeddingSchema>;
export type DocumentSearchResult = typeof documentSearchResults.$inferSelect;
export type InsertDocumentSearchResult = z.infer<typeof insertDocumentSearchResultSchema>;
export type ServiceNowConfiguration = typeof serviceNowConfiguration.$inferSelect;
export type InsertServiceNowConfiguration = z.infer<typeof insertServiceNowConfigurationSchema>;
export type ServiceNowIntegration = typeof serviceNowIntegration.$inferSelect;
export type InsertServiceNowIntegration = z.infer<typeof insertServiceNowIntegrationSchema>;
