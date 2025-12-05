import { ServiceNowConfiguration, ServiceNowIntegration, Incident, InsertServiceNowIntegration } from '@shared/schema';

export interface ServiceNowIncident {
  sys_id: string;
  number: string;
  short_description: string;
  description: string;
  state: string;
  priority: string;
  urgency: string;
  impact: string;
  assigned_to: {
    display_value: string;
    link: string;
  };
  opened_at: string;
  updated_at: string;
  caller_id: {
    display_value: string;
    link: string;
  };
  sys_created_on: string;
  sys_updated_on: string;
}

export interface ServiceNowAttachment {
  sys_id: string;
  file_name: string;
  content_type: string;
  size_bytes: string;
  table_name: string;
  table_sys_id: string;
  content?: string; // Log file content when fetched
}

export class ServiceNowService {
  private config: ServiceNowConfiguration | null = null;
  private baseUrl: string = '';
  private authHeaders: Record<string, string> = {};
  private altAuthHeaders: Record<string, string> = {};

  constructor(config?: ServiceNowConfiguration) {
    if (config) {
      this.initialize(config);
    }
  }

  initialize(config: ServiceNowConfiguration): void {
    this.config = config;
    // Handle both full URLs and instance names
    if (config.instance.startsWith('http')) {
      this.baseUrl = config.instance;
    } else {
      this.baseUrl = `https://${config.instance}.service-now.com`;
    }
    
    const apiToken = process.env.SERVICENOW_API_TOKEN;
    const password = process.env.SERVICENOW_PASSWORD;
    
    console.log('ServiceNow API Token status:', {
      exists: !!apiToken,
      length: apiToken?.length || 0,
      first4: apiToken?.substring(0, 4) || 'N/A',
      instance: config.instance,
      hasPassword: !!password,
      passwordLength: password?.length || 0,
      username: config.username,
      altUsername: config.username.includes('@') ? config.username.split('@')[0] : config.username
    });
    
    if (!apiToken && !password) {
      throw new Error('SERVICENOW_API_TOKEN or SERVICENOW_PASSWORD environment variable is required');
    }

    // ServiceNow uses Basic Auth with username:password or username:token
    const authValue = password || apiToken;
    
    // Try both email format and username-only format
    const username = config.username;
    const altUsername = username.includes('@') ? username.split('@')[0] : username;
    
    const credentials = Buffer.from(`${username}:${authValue}`).toString('base64');
    const altCredentials = Buffer.from(`${altUsername}:${authValue}`).toString('base64');
    
    this.authHeaders = {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
    
    // Store alternative credentials for fallback
    this.altAuthHeaders = {
      'Authorization': `Basic ${altCredentials}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
  }

  async testConnection(): Promise<boolean> {
    if (!this.config) {
      throw new Error('ServiceNow client not initialized');
    }

    try {
      console.log('Testing ServiceNow connection with URL:', `${this.baseUrl}/api/now/table/incident?sysparm_limit=1`);
      console.log('Auth headers:', { ...this.authHeaders, Authorization: '[REDACTED]' });
      
      const response = await fetch(`${this.baseUrl}/api/now/table/incident?sysparm_limit=1`, {
        method: 'GET',
        headers: this.authHeaders
      });

      const responseText = await response.text();
      
      if (!response.ok) {
        console.error('ServiceNow connection test failed:', response.status, responseText);
        
        // Try alternative authentication method with username-only format
        if (response.status === 401) {
          console.log('Trying alternative authentication with username-only format...');
          const altResponse = await fetch(`${this.baseUrl}/api/now/table/incident?sysparm_limit=1`, {
            method: 'GET',
            headers: this.altAuthHeaders
          });
          
          const altResponseText = await altResponse.text();
          console.log('Alternative auth response:', altResponse.status, altResponseText);
          
          if (altResponse.ok) {
            console.log('Alternative authentication successful!');
            // Update primary auth headers to use the working method
            this.authHeaders = { ...this.altAuthHeaders };
            return true;
          }
        }
        
        return false;
      }

      console.log('ServiceNow connection test successful:', response.status);
      return true;
    } catch (error) {
      console.error('ServiceNow connection test failed:', error);
      return false;
    }
  }

  async createIncidentFromLog(incident: Incident, logContent: string): Promise<ServiceNowIncident> {
    if (!this.config) {
      throw new Error('ServiceNow client not initialized');
    }

    const severityToPriority = this.config.priorityMapping as Record<string, string> || {
      'CRITICAL': '1',
      'HIGH': '2',
      'MEDIUM': '3',
      'LOW': '4'
    };

    const severityToUrgency = this.config.urgencyMapping as Record<string, string> || {
      'CRITICAL': '1',
      'HIGH': '2',
      'MEDIUM': '3',
      'LOW': '3'
    };

    const priority = severityToPriority[incident.severity] || '3';
    const urgency = severityToUrgency[incident.severity] || '3';

    const incidentData = {
      short_description: incident.title,
      description: incident.description,
      priority: priority,
      urgency: urgency,
      impact: priority, // Use same as priority for simplicity
      state: '1', // New
      caller_id: this.config.callerId || '', // Should be configured
      assignment_group: this.config.assignmentGroup || ''
    };

    try {
      const response = await fetch(`${this.baseUrl}/api/now/table/incident`, {
        method: 'POST',
        headers: this.authHeaders,
        body: JSON.stringify(incidentData)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`ServiceNow API error: ${response.status} ${errorText}`);
      }

      const result = await response.json();
      const createdIncident = result.result;

      // Create attachment with log content
      if (logContent) {
        await this.createAttachment(createdIncident.sys_id, 'exception_log.txt', logContent);
      }

      return {
        sys_id: createdIncident.sys_id,
        number: createdIncident.number,
        short_description: createdIncident.short_description,
        description: createdIncident.description,
        state: createdIncident.state,
        priority: createdIncident.priority,
        urgency: createdIncident.urgency,
        impact: createdIncident.impact,
        assigned_to: createdIncident.assigned_to || { display_value: '', link: '' },
        opened_at: createdIncident.opened_at,
        updated_at: createdIncident.sys_updated_on,
        caller_id: createdIncident.caller_id || { display_value: '', link: '' },
        sys_created_on: createdIncident.sys_created_on,
        sys_updated_on: createdIncident.sys_updated_on
      };
    } catch (error) {
      console.error('Failed to create ServiceNow incident:', error);
      throw error;
    }
  }

  async createAttachment(tableSysId: string, fileName: string, content: string): Promise<ServiceNowAttachment> {
    if (!this.config) {
      throw new Error('ServiceNow client not initialized');
    }

    try {
      // First, upload the file
      const formData = new FormData();
      const blob = new Blob([content], { type: 'text/plain' });
      formData.append('uploadFile', blob, fileName);
      formData.append('table_name', 'incident');
      formData.append('table_sys_id', tableSysId);
      formData.append('file_name', fileName);

      const uploadResponse = await fetch(`${this.baseUrl}/api/now/attachment/file`, {
        method: 'POST',
        headers: {
          'Authorization': this.authHeaders['Authorization']
        },
        body: formData
      });

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        throw new Error(`ServiceNow attachment upload error: ${uploadResponse.status} ${errorText}`);
      }

      const uploadResult = await uploadResponse.json();
      return uploadResult.result;
    } catch (error) {
      console.error('Failed to create ServiceNow attachment:', error);
      throw error;
    }
  }

  async getIncidentAttachments(sysId: string): Promise<ServiceNowAttachment[]> {
    if (!this.config) {
      throw new Error('ServiceNow client not initialized');
    }

    try {
      const response = await fetch(`${this.baseUrl}/api/now/table/sys_attachment?sysparm_query=table_name=incident^table_sys_id=${sysId}`, {
        method: 'GET',
        headers: this.authHeaders
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`ServiceNow API error: ${response.status} ${errorText}`);
      }

      const result = await response.json();
      return result.result || [];
    } catch (error) {
      console.error('Failed to fetch ServiceNow attachments:', error);
      return [];
    }
  }

  async getAttachmentContent(attachmentSysId: string): Promise<string> {
    if (!this.config) {
      throw new Error('ServiceNow client not initialized');
    }

    try {
      const response = await fetch(`${this.baseUrl}/api/now/attachment/${attachmentSysId}/file`, {
        method: 'GET',
        headers: this.authHeaders
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`ServiceNow API error: ${response.status} ${errorText}`);
      }

      return await response.text();
    } catch (error) {
      console.error('Failed to fetch attachment content:', error);
      return '';
    }
  }

  async getIncidentWithLogs(sysId: string): Promise<ServiceNowIncident & { logContent?: string }> {
    if (!this.config) {
      throw new Error('ServiceNow client not initialized');
    }

    try {
      // Get the incident
      const incident = await this.getIncident(sysId);
      
      // Get attachments
      const attachments = await this.getIncidentAttachments(sysId);
      
      // Extract log content from attachments
      let logContent = '';
      for (const attachment of attachments) {
        // Check if this is a log file
        if (this.isLogFile(attachment.file_name)) {
          const content = await this.getAttachmentContent(attachment.sys_id);
          logContent += `\n--- ${attachment.file_name} ---\n${content}\n`;
        }
      }
      
      return {
        ...incident,
        logContent: logContent.trim()
      };
    } catch (error) {
      console.error('Failed to fetch incident with logs:', error);
      throw error;
    }
  }

  private isLogFile(filename: string): boolean {
    const logExtensions = ['.log', '.txt', '.out', '.err', '.trace'];
    const logKeywords = ['log', 'error', 'exception', 'trace', 'debug'];
    
    const lowerFilename = filename.toLowerCase();
    
    // Check file extensions
    if (logExtensions.some(ext => lowerFilename.endsWith(ext))) {
      return true;
    }
    
    // Check for log keywords in filename
    return logKeywords.some(keyword => lowerFilename.includes(keyword));
  }

  async getIncident(sysId: string): Promise<ServiceNowIncident> {
    if (!this.config) {
      throw new Error('ServiceNow client not initialized');
    }

    try {
      const response = await fetch(`${this.baseUrl}/api/now/table/incident/${sysId}`, {
        method: 'GET',
        headers: this.authHeaders
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`ServiceNow API error: ${response.status} ${errorText}`);
      }

      const result = await response.json();
      const incident = result.result;

      return {
        sys_id: incident.sys_id,
        number: incident.number,
        short_description: incident.short_description,
        description: incident.description,
        state: incident.state,
        priority: incident.priority,
        urgency: incident.urgency,
        impact: incident.impact,
        assigned_to: incident.assigned_to || { display_value: '', link: '' },
        opened_at: incident.opened_at,
        updated_at: incident.sys_updated_on,
        caller_id: incident.caller_id || { display_value: '', link: '' },
        sys_created_on: incident.sys_created_on,
        sys_updated_on: incident.sys_updated_on
      };
    } catch (error) {
      console.error('Failed to get ServiceNow incident:', error);
      throw error;
    }
  }

  async pollRecentIncidents(sinceMinutes: number = 5): Promise<ServiceNowIncident[]> {
    if (!this.config) {
      throw new Error('ServiceNow client not initialized');
    }

    try {
      const sinceTime = new Date(Date.now() - sinceMinutes * 60 * 1000).toISOString();
      const encodedQuery = `sys_created_on>=${sinceTime}^state=1^ORstate=2^ORstate=3`;
      
      const response = await fetch(
        `${this.baseUrl}/api/now/table/incident?sysparm_query=${encodeURIComponent(encodedQuery)}&sysparm_limit=50&sysparm_order_by=sys_created_on`,
        {
          method: 'GET',
          headers: this.authHeaders
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`ServiceNow API error: ${response.status} ${errorText}`);
      }

      const result = await response.json();
      return result.result.map((incident: any) => ({
        sys_id: incident.sys_id,
        number: incident.number,
        short_description: incident.short_description,
        description: incident.description,
        state: incident.state,
        priority: incident.priority,
        urgency: incident.urgency,
        impact: incident.impact,
        assigned_to: incident.assigned_to || { display_value: '', link: '' },
        opened_at: incident.opened_at,
        updated_at: incident.sys_updated_on,
        caller_id: incident.caller_id || { display_value: '', link: '' },
        sys_created_on: incident.sys_created_on,
        sys_updated_on: incident.sys_updated_on
      }));
    } catch (error) {
      console.error('Failed to poll ServiceNow incidents:', error);
      throw error;
    }
  }

  async updateIncidentState(sysId: string, state: string): Promise<ServiceNowIncident> {
    if (!this.config) {
      throw new Error('ServiceNow client not initialized');
    }

    try {
      const response = await fetch(`${this.baseUrl}/api/now/table/incident/${sysId}`, {
        method: 'PUT',
        headers: this.authHeaders,
        body: JSON.stringify({ state })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`ServiceNow API error: ${response.status} ${errorText}`);
      }

      const result = await response.json();
      const incident = result.result;

      return {
        sys_id: incident.sys_id,
        number: incident.number,
        short_description: incident.short_description,
        description: incident.description,
        state: incident.state,
        priority: incident.priority,
        urgency: incident.urgency,
        impact: incident.impact,
        assigned_to: incident.assigned_to || { display_value: '', link: '' },
        opened_at: incident.opened_at,
        updated_at: incident.sys_updated_on,
        caller_id: incident.caller_id || { display_value: '', link: '' },
        sys_created_on: incident.sys_created_on,
        sys_updated_on: incident.sys_updated_on
      };
    } catch (error) {
      console.error('Failed to update ServiceNow incident:', error);
      throw error;
    }
  }
}

export const serviceNowService = new ServiceNowService();