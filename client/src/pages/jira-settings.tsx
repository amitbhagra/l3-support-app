import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle, XCircle, Settings, ExternalLink } from "lucide-react";

interface JiraConfiguration {
  id: number;
  domain: string;
  email: string;
  projectKey: string;
  autoSync: boolean;
  syncInterval: number;
  isActive: boolean;
  issueTypeMapping?: Record<string, string>;
  priorityMapping?: Record<string, string>;
}

interface JiraIntegration {
  id: number;
  incidentId: number;
  jiraIssueKey: string;
  jiraIssueId: string;
  projectKey: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  syncStatus: string;
  metadata?: {
    jiraUrl?: string;
  };
}

export default function JiraSettings() {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    domain: '',
    email: '',
    projectKey: '',
    autoSync: true,
    syncInterval: 300
  });

  const { data: configuration, isLoading: configLoading } = useQuery<JiraConfiguration>({
    queryKey: ['/api/jira/configuration'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/jira/configuration');
      return response.ok ? await response.json() : null;
    }
  });

  const { data: integrations, isLoading: integrationsLoading } = useQuery<JiraIntegration[]>({
    queryKey: ['/api/jira/integrations']
  });

  const { data: connectionStatus, isLoading: connectionLoading } = useQuery({
    queryKey: ['/api/jira/test-connection'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/jira/test-connection');
      return response.ok ? await response.json() : { connected: false };
    },
    enabled: !!configuration
  });

  const configurationMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const response = await apiRequest('POST', '/api/jira/configuration', data);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to save configuration');
      }
      return await response.json();
    },
    onSuccess: () => {
      toast({
        title: "Configuration Saved",
        description: "JIRA configuration has been saved successfully",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/jira/configuration'] });
      queryClient.invalidateQueries({ queryKey: ['/api/jira/test-connection'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    configurationMutation.mutate(formData);
  };

  const handleInputChange = (key: string, value: string | boolean | number) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  };

  // Set form data when configuration loads
  useState(() => {
    if (configuration) {
      setFormData({
        domain: configuration.domain || '',
        email: configuration.email || '',
        projectKey: configuration.projectKey || '',
        autoSync: configuration.autoSync ?? true,
        syncInterval: configuration.syncInterval || 300
      });
    }
  }, [configuration]);

  const isLoading = configLoading || connectionLoading;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">JIRA Integration Settings</h1>
        {connectionStatus && (
          <Badge variant={connectionStatus.connected ? "default" : "destructive"}>
            {connectionStatus.connected ? (
              <CheckCircle className="h-3 w-3 mr-1" />
            ) : (
              <XCircle className="h-3 w-3 mr-1" />
            )}
            {connectionStatus.connected ? "Connected" : "Disconnected"}
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Configuration Form */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Settings className="h-5 w-5 mr-2" />
              JIRA Configuration
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="domain">JIRA Domain</Label>
                <Input
                  id="domain"
                  type="text"
                  placeholder="company.atlassian.net"
                  value={formData.domain}
                  onChange={(e) => handleInputChange('domain', e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="your.email@company.com"
                  value={formData.email}
                  onChange={(e) => handleInputChange('email', e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="projectKey">Project Key</Label>
                <Input
                  id="projectKey"
                  type="text"
                  placeholder="PROJ"
                  value={formData.projectKey}
                  onChange={(e) => handleInputChange('projectKey', e.target.value.toUpperCase())}
                  required
                />
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="autoSync"
                  checked={formData.autoSync}
                  onCheckedChange={(checked) => handleInputChange('autoSync', checked)}
                />
                <Label htmlFor="autoSync">Auto-create JIRA tickets for new incidents</Label>
              </div>

              <div className="space-y-2">
                <Label htmlFor="syncInterval">Sync Interval (seconds)</Label>
                <Input
                  id="syncInterval"
                  type="number"
                  min="60"
                  max="3600"
                  value={formData.syncInterval}
                  onChange={(e) => handleInputChange('syncInterval', parseInt(e.target.value))}
                />
              </div>

              <Button
                type="submit"
                disabled={configurationMutation.isPending}
                className="w-full"
              >
                {configurationMutation.isPending ? "Saving..." : "Save Configuration"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Integration Status */}
        <Card>
          <CardHeader>
            <CardTitle>Integration Status</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8">Loading...</div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Connection Status:</span>
                  <Badge variant={connectionStatus?.connected ? "default" : "destructive"}>
                    {connectionStatus?.connected ? "Connected" : "Disconnected"}
                  </Badge>
                </div>

                {configuration && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Domain:</span>
                      <span className="text-sm">{configuration.domain}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Project:</span>
                      <span className="text-sm">{configuration.projectKey}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Auto-sync:</span>
                      <Badge variant={configuration.autoSync ? "default" : "secondary"}>
                        {configuration.autoSync ? "Enabled" : "Disabled"}
                      </Badge>
                    </div>
                  </div>
                )}

                {integrations && integrations.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="font-medium">Recent Integrations:</h4>
                    <div className="space-y-1">
                      {integrations.slice(0, 5).map((integration) => (
                        <div key={integration.id} className="flex items-center justify-between text-sm">
                          <span>{integration.jiraIssueKey}</span>
                          <div className="flex items-center space-x-2">
                            <Badge variant="outline" className="text-xs">
                              {integration.status}
                            </Badge>
                            {integration.metadata?.jiraUrl && (
                              <a
                                href={integration.metadata.jiraUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:text-blue-800"
                              >
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Instructions */}
      <Card>
        <CardHeader>
          <CardTitle>Setup Instructions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4 text-sm">
            <div>
              <h4 className="font-medium mb-2">1. Generate JIRA API Token</h4>
              <p className="text-muted-foreground">
                Go to your JIRA account settings → Security → API tokens → Create API token.
                The token should be stored in your environment as JIRA_API_TOKEN.
              </p>
            </div>
            <div>
              <h4 className="font-medium mb-2">2. Configure Integration</h4>
              <p className="text-muted-foreground">
                Fill in your JIRA domain (without https://), email address, and project key.
                Enable auto-sync to automatically create tickets for new incidents.
              </p>
            </div>
            <div>
              <h4 className="font-medium mb-2">3. Automatic Workflow</h4>
              <p className="text-muted-foreground">
                When enabled, JIRA tickets will be created automatically for Active alerts and closed
                when you click "Approve & Create PR" for code fixes.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}