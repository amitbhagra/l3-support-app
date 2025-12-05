import { Version3Client } from 'jira.js';
import { JiraConfiguration, JiraIntegration, Incident, InsertJiraIntegration } from '@shared/schema';

export interface JiraIssue {
  id: string;
  key: string;
  fields: {
    summary: string;
    description?: any;
    status: {
      name: string;
      id: string;
    };
    priority: {
      name: string;
      id: string;
    };
    issuetype: {
      name: string;
      id: string;
    };
    assignee?: {
      displayName: string;
      emailAddress: string;
    };
    reporter: {
      displayName: string;
      emailAddress: string;
    };
    created: string;
    updated: string;
    project: {
      key: string;
      name: string;
    };
  };
}

export class JiraService {
  private client: Version3Client | null = null;
  private config: JiraConfiguration | null = null;

  constructor(config?: JiraConfiguration) {
    if (config) {
      this.initialize(config);
    }
  }

  initialize(config: JiraConfiguration): void {
    this.config = config;
    const apiToken = process.env.JIRA_API_TOKEN;
    
    console.log('JIRA API Token status:', {
      exists: !!apiToken,
      length: apiToken?.length || 0,
      first4: apiToken?.substring(0, 4) || 'N/A'
    });
    
    if (!apiToken) {
      throw new Error('JIRA_API_TOKEN environment variable is required');
    }

    this.client = new Version3Client({
      host: `https://${config.domain}`,
      authentication: {
        basic: {
          email: config.email,
          apiToken: apiToken
        }
      }
    });
  }

  async testConnection(): Promise<boolean> {
    if (!this.client) {
      throw new Error('Jira client not initialized');
    }

    try {
      await this.client.myself.getCurrentUser();
      return true;
    } catch (error) {
      console.error('Jira connection test failed:', error);
      return false;
    }
  }

  async createIssueFromIncident(incident: Incident): Promise<JiraIssue> {
    if (!this.client || !this.config) {
      throw new Error('Jira client not initialized');
    }

    const severityToIssueType = this.config.issueTypeMapping as Record<string, string> || {
      'CRITICAL': 'Bug',
      'HIGH': 'Bug',
      'MEDIUM': 'Task',
      'LOW': 'Task'
    };

    const severityToPriority = this.config.priorityMapping as Record<string, string> || {
      'CRITICAL': 'Highest',
      'HIGH': 'High',
      'MEDIUM': 'Medium',
      'LOW': 'Low'
    };

    const issueType = severityToIssueType[incident.severity] || 'Task';
    const priority = severityToPriority[incident.severity] || 'Medium';

    const description = {
      type: 'doc',
      version: 1,
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: `Incident ID: ${incident.incidentId}`
            }
          ]
        },
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: `Description: ${incident.description}`
            }
          ]
        },
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: `Severity: ${incident.severity}`
            }
          ]
        },
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: `Started At: ${incident.startedAt.toISOString()}`
            }
          ]
        }
      ]
    };

    // Try to find or create the assignee
    let assignee = null;
    let assigneeDisplayName = 'AI IT Support Agent';
    
    try {
      // First try to find the exact user 'AI IT Support Agent'
      const targetAssignee = 'AI IT Support Agent';
      let users = await this.client.userSearch.findUsers({
        query: targetAssignee,
        maxResults: 5
      });
      
      // Look for exact match first
      const exactMatch = users.find(user => user.displayName === targetAssignee);
      if (exactMatch) {
        assignee = { accountId: exactMatch.accountId };
        assigneeDisplayName = exactMatch.displayName;
        console.log(`Found exact match for assignee: ${targetAssignee} (${exactMatch.accountId})`);
      } else {
        // If 'AI IT Support Agent' doesn't exist, assign to the configuring user
        console.log(`User '${targetAssignee}' not found, searching for configuring user: ${this.config.email}`);
        users = await this.client.userSearch.findUsers({
          query: this.config.email,
          maxResults: 1
        });
        
        if (users.length > 0) {
          assignee = { accountId: users[0].accountId };
          assigneeDisplayName = users[0].displayName;
          console.log(`Assigned to configuring user: ${users[0].displayName} (${users[0].accountId})`);
        } else {
          console.log(`Neither '${targetAssignee}' nor configuring user found. Creating ticket without assignee.`);
        }
      }
    } catch (error) {
      console.log('Could not search for assignee, creating ticket without assignee:', error);
    }

    const createIssueData = {
      fields: {
        project: {
          key: this.config.projectKey
        },
        summary: `[L3 Support] ${incident.title}`,
        description,
        issuetype: {
          name: issueType
        },
        priority: {
          name: priority
        },
        labels: ['l3-support', 'automated', `severity-${incident.severity.toLowerCase()}`],
        ...(assignee && { assignee })
      }
    };

    try {
      const issue = await this.client.issues.createIssue(createIssueData);
      return {
        id: issue.id!,
        key: issue.key!,
        fields: {
          summary: createIssueData.fields.summary,
          description: createIssueData.fields.description,
          status: { name: 'To Do', id: '1' },
          priority: { name: priority, id: '1' },
          issuetype: { name: issueType, id: '1' },
          assignee: assignee ? { displayName: assigneeDisplayName, emailAddress: this.config.email } : undefined,
          reporter: { displayName: 'L3 Support System', emailAddress: this.config.email },
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
          project: { key: this.config.projectKey, name: this.config.projectKey }
        }
      };
    } catch (error) {
      console.error('Failed to create Jira issue:', error);
      throw error;
    }
  }

  async getIssue(issueKey: string): Promise<JiraIssue> {
    if (!this.client) {
      throw new Error('Jira client not initialized');
    }

    try {
      const issue = await this.client.issues.getIssue({
        issueIdOrKey: issueKey,
        expand: ['fields']
      });

      return {
        id: issue.id!,
        key: issue.key!,
        fields: {
          summary: issue.fields.summary,
          description: issue.fields.description,
          status: {
            name: issue.fields.status.name,
            id: issue.fields.status.id
          },
          priority: {
            name: issue.fields.priority?.name || 'Medium',
            id: issue.fields.priority?.id || '3'
          },
          issuetype: {
            name: issue.fields.issuetype.name,
            id: issue.fields.issuetype.id
          },
          assignee: issue.fields.assignee ? {
            displayName: issue.fields.assignee.displayName,
            emailAddress: issue.fields.assignee.emailAddress
          } : undefined,
          reporter: {
            displayName: issue.fields.reporter.displayName,
            emailAddress: issue.fields.reporter.emailAddress
          },
          created: issue.fields.created,
          updated: issue.fields.updated,
          project: {
            key: issue.fields.project.key,
            name: issue.fields.project.name
          }
        }
      };
    } catch (error) {
      console.error('Failed to get Jira issue:', error);
      throw error;
    }
  }

  async updateIssueStatus(issueKey: string, status: string): Promise<void> {
    if (!this.client) {
      throw new Error('Jira client not initialized');
    }

    try {
      // Get available transitions for the issue
      const transitions = await this.client.issues.getTransitions({
        issueIdOrKey: issueKey
      });

      const targetTransition = transitions.transitions?.find(t => 
        t.to?.name?.toLowerCase() === status.toLowerCase()
      );

      if (!targetTransition) {
        throw new Error(`No transition available to status: ${status}`);
      }

      await this.client.issues.doTransition({
        issueIdOrKey: issueKey,
        transition: {
          id: targetTransition.id!
        }
      });
    } catch (error) {
      console.error('Failed to update Jira issue status:', error);
      throw error;
    }
  }

  async addComment(issueKey: string, comment: string): Promise<void> {
    if (!this.client) {
      throw new Error('Jira client not initialized');
    }

    try {
      await this.client.issueComments.addComment({
        issueIdOrKey: issueKey,
        body: {
          type: 'doc',
          version: 1,
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: comment
                }
              ]
            }
          ]
        }
      });
    } catch (error) {
      console.error('Failed to add Jira comment:', error);
      throw error;
    }
  }

  async syncIssueWithIncident(jiraIssue: JiraIssue, incident: Incident): Promise<InsertJiraIntegration> {
    return {
      incidentId: incident.id,
      jiraIssueKey: jiraIssue.key,
      jiraIssueId: jiraIssue.id,
      projectKey: jiraIssue.fields.project.key,
      issueType: jiraIssue.fields.issuetype.name,
      priority: jiraIssue.fields.priority.name,
      status: jiraIssue.fields.status.name,
      assignee: jiraIssue.fields.assignee?.displayName || null,
      reporter: jiraIssue.fields.reporter.displayName,
      syncStatus: 'SYNCED',
      metadata: {
        lastSync: new Date().toISOString(),
        jiraUrl: `https://${this.config?.domain}/browse/${jiraIssue.key}`
      }
    };
  }

  async getProjectInfo(projectKey: string): Promise<any> {
    if (!this.client) {
      throw new Error('Jira client not initialized');
    }

    try {
      const project = await this.client.projects.getProject({
        projectIdOrKey: projectKey
      });
      return project;
    } catch (error) {
      console.error('Failed to get Jira project info:', error);
      throw error;
    }
  }

  async getIssueTypes(projectKey: string): Promise<any[]> {
    if (!this.client) {
      throw new Error('Jira client not initialized');
    }

    try {
      const project = await this.client.projects.getProject({
        projectIdOrKey: projectKey,
        expand: ['issueTypes']
      });
      return project.issueTypes || [];
    } catch (error) {
      console.error('Failed to get Jira issue types:', error);
      throw error;
    }
  }
}

export const jiraService = new JiraService();