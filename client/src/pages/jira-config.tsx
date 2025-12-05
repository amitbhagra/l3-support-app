import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { CheckCircle, XCircle, Settings, Link, TestTube } from 'lucide-react';

interface JiraConfig {
  id?: number;
  domain: string;
  email: string;
  projectKey: string;
  issueTypeMapping: Record<string, string>;
  priorityMapping: Record<string, string>;
  customFields: Record<string, string>;
  autoSync: boolean;
  syncInterval: number;
  isActive: boolean;
}

export default function JiraConfig() {
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'unknown' | 'testing' | 'connected' | 'failed'>('unknown');
  
  const [formData, setFormData] = useState<JiraConfig>({
    domain: '',
    email: '',
    projectKey: '',
    issueTypeMapping: {
      'HIGH': 'Bug',
      'MEDIUM': 'Task',
      'LOW': 'Story'
    },
    priorityMapping: {
      'HIGH': 'Highest',
      'MEDIUM': 'Medium',
      'LOW': 'Low'
    },
    customFields: {},
    autoSync: true,
    syncInterval: 300, // 5 minutes
    isActive: true
  });

  const { data: config, isLoading } = useQuery({
    queryKey: ['/api/jira/config'],
    retry: false,
    queryFn: async () => {
      try {
        const response = await fetch('/api/jira/config');
        if (!response.ok) {
          if (response.status === 404) {
            return null; // No configuration exists yet
          }
          throw new Error('Failed to fetch configuration');
        }
        return await response.json();
      } catch (error) {
        console.error('Error fetching JIRA config:', error);
        return null;
      }
    }
  });

  const saveConfigMutation = useMutation({
    mutationFn: async (configData: JiraConfig) => {
      const response = await fetch('/api/jira/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(configData)
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to save configuration');
      }
      return await response.json();
    },
    onSuccess: () => {
      toast({
        title: "Configuration Saved",
        description: "Jira integration has been configured successfully."
      });
      queryClient.invalidateQueries({ queryKey: ['/api/jira/config'] });
      setIsEditing(false);
    },
    onError: (error: any) => {
      toast({
        title: "Configuration Failed",
        description: error.message || "Failed to save Jira configuration.",
        variant: "destructive"
      });
    }
  });

  const testConnectionMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/jira/test-connection', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      });
      if (!response.ok) {
        throw new Error('Connection test failed');
      }
      return await response.json();
    },
    onSuccess: (data: any) => {
      setConnectionStatus(data.connected ? 'connected' : 'failed');
      toast({
        title: data.connected ? "Connection Successful" : "Connection Failed",
        description: data.connected 
          ? "Successfully connected to Jira instance." 
          : "Unable to connect to Jira. Please check your configuration.",
        variant: data.connected ? "default" : "destructive"
      });
    },
    onError: () => {
      setConnectionStatus('failed');
      toast({
        title: "Connection Test Failed",
        description: "Unable to test Jira connection.",
        variant: "destructive"
      });
    }
  });

  const handleTestConnection = () => {
    setConnectionStatus('testing');
    testConnectionMutation.mutate();
  };

  const handleSave = () => {
    saveConfigMutation.mutate(formData);
  };

  const handleEdit = () => {
    if (config) {
      setFormData({
        domain: config.domain || '',
        email: config.email || '',
        projectKey: config.projectKey || '',
        issueTypeMapping: config.issueTypeMapping || {
          'HIGH': 'Bug',
          'MEDIUM': 'Task',
          'LOW': 'Story'
        },
        priorityMapping: config.priorityMapping || {
          'HIGH': 'Highest',
          'MEDIUM': 'Medium',
          'LOW': 'Low'
        },
        customFields: config.customFields || {},
        autoSync: config.autoSync ?? true,
        syncInterval: config.syncInterval || 300,
        isActive: config.isActive ?? true
      });
    }
    setIsEditing(true);
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="h-32 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  const isConfigured = config && config.domain && config.email && config.projectKey;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Jira Integration</h1>
          <p className="text-muted-foreground">
            Configure Jira integration for automated ticket management
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isConfigured && (
            <Badge variant={config.isActive ? "default" : "secondary"}>
              {config.isActive ? "Active" : "Inactive"}
            </Badge>
          )}
          {connectionStatus === 'connected' && <CheckCircle className="h-5 w-5 text-green-500" />}
          {connectionStatus === 'failed' && <XCircle className="h-5 w-5 text-red-500" />}
        </div>
      </div>

      {!isConfigured && (
        <Alert>
          <Settings className="h-4 w-4" />
          <AlertDescription>
            Jira integration is not configured. Set up your Jira connection to enable automated ticket management.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link className="h-5 w-5" />
            Connection Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!isEditing && isConfigured ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium">Jira Domain</Label>
                  <p className="text-sm text-muted-foreground">{config.domain}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium">Email</Label>
                  <p className="text-sm text-muted-foreground">{config.email}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium">Project Key</Label>
                  <p className="text-sm text-muted-foreground">{config.projectKey}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium">Auto Sync</Label>
                  <p className="text-sm text-muted-foreground">
                    {config.autoSync ? `Every ${config.syncInterval / 60} minutes` : 'Disabled'}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button onClick={handleEdit} variant="outline">
                  <Settings className="h-4 w-4 mr-2" />
                  Edit Configuration
                </Button>
                <Button 
                  onClick={handleTestConnection}
                  disabled={testConnectionMutation.isPending}
                  variant="outline"
                >
                  <TestTube className="h-4 w-4 mr-2" />
                  {testConnectionMutation.isPending ? 'Testing...' : 'Test Connection'}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="domain">Jira Domain</Label>
                  <Input
                    id="domain"
                    placeholder="your-company.atlassian.net"
                    value={formData.domain}
                    onChange={(e) => setFormData({ ...formData, domain: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="your-email@company.com"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="projectKey">Project Key</Label>
                  <Input
                    id="projectKey"
                    placeholder="SUP"
                    value={formData.projectKey}
                    onChange={(e) => setFormData({ ...formData, projectKey: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="syncInterval">Sync Interval (seconds)</Label>
                  <Input
                    id="syncInterval"
                    type="number"
                    min="60"
                    value={formData.syncInterval}
                    onChange={(e) => setFormData({ ...formData, syncInterval: parseInt(e.target.value) || 300 })}
                  />
                </div>
              </div>
              
              <div className="flex items-center space-x-2">
                <Switch
                  id="autoSync"
                  checked={formData.autoSync}
                  onCheckedChange={(checked) => setFormData({ ...formData, autoSync: checked })}
                />
                <Label htmlFor="autoSync">Enable automatic synchronization</Label>
              </div>
              
              <div className="flex items-center space-x-2">
                <Switch
                  id="isActive"
                  checked={formData.isActive}
                  onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
                />
                <Label htmlFor="isActive">Activate Jira integration</Label>
              </div>

              <div className="flex gap-2">
                <Button 
                  onClick={handleSave}
                  disabled={saveConfigMutation.isPending}
                >
                  {saveConfigMutation.isPending ? 'Saving...' : 'Save Configuration'}
                </Button>
                {isConfigured && (
                  <Button onClick={() => setIsEditing(false)} variant="outline">
                    Cancel
                  </Button>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {isConfigured && (
        <Card>
          <CardHeader>
            <CardTitle>Issue Mapping</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <Label className="text-sm font-medium">Severity to Issue Type Mapping</Label>
                <div className="mt-2 space-y-2">
                  {Object.entries(config.issueTypeMapping || {}).map(([severity, issueType]) => (
                    <div key={severity} className="flex items-center justify-between p-2 bg-muted rounded">
                      <span className="text-sm">{severity}</span>
                      <Badge variant="outline">{issueType}</Badge>
                    </div>
                  ))}
                </div>
              </div>
              
              <div>
                <Label className="text-sm font-medium">Severity to Priority Mapping</Label>
                <div className="mt-2 space-y-2">
                  {Object.entries(config.priorityMapping || {}).map(([severity, priority]) => (
                    <div key={severity} className="flex items-center justify-between p-2 bg-muted rounded">
                      <span className="text-sm">{severity}</span>
                      <Badge variant="outline">{priority}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}