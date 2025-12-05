import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import Header from "@/components/dashboard/header";
import Sidebar from "@/components/dashboard/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Clock, Users, TrendingUp, RefreshCw, ExternalLink, Ticket, Cloud } from "lucide-react";
import { useState } from "react";

export default function Alerts() {
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { toast } = useToast();
  
  const { data: activeIncidents, isLoading, refetch } = useQuery({
    queryKey: ['/api/active-alerts'],
    staleTime: 0, // Always consider data stale
    gcTime: 0, // Don't cache data (renamed from cacheTime in v5)
    refetchOnWindowFocus: true, // Refetch when window gains focus
    refetchInterval: 30000, // Auto-refresh every 30 seconds
  });

  const { data: jiraIntegrations } = useQuery({
    queryKey: ['/api/jira/integrations'],
    staleTime: 30000, // Cache for 30 seconds
  });

  const { data: serviceNowConfig } = useQuery({
    queryKey: ['/api/servicenow/config'],
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  const incidents = Array.isArray(activeIncidents) ? activeIncidents : [];
  const integrations = Array.isArray(jiraIntegrations) ? jiraIntegrations : [];

  const handleRefresh = async () => {
    setIsRefreshing(true);
    // Clear all related cache
    await queryClient.invalidateQueries({ queryKey: ['/api/active-alerts'] });
    await queryClient.invalidateQueries({ queryKey: ['/api/incidents'] });
    await queryClient.invalidateQueries({ queryKey: ['/api/dashboard/metrics'] });
    // Force refetch
    await refetch();
    setIsRefreshing(false);
  };

  const getSeverityColor = (severity: string) => {
    switch (severity?.toUpperCase()) {
      case 'CRITICAL': return 'destructive';
      case 'HIGH': return 'destructive';
      case 'MEDIUM': return 'secondary';
      case 'LOW': return 'outline';
      default: return 'outline';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'investigating': return 'secondary';
      case 'escalated': return 'destructive';
      case 'resolved': return 'default';
      default: return 'outline';
    }
  };

  const createJiraTicketMutation = useMutation({
    mutationFn: async (incidentId: number) => {
      const response = await apiRequest('POST', '/api/jira/create-ticket', { incidentId });
      return await response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "JIRA Ticket Created",
        description: `Successfully created JIRA ticket: ${data.jiraIssue.key}`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/jira/integrations'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  const pollServiceNowMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('GET', '/api/servicenow/poll-incidents?since=5');
      return await response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "ServiceNow Polling Complete",
        description: `Found ${data.newIncidents} new incidents from ServiceNow`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/active-alerts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/incidents'] });
      queryClient.invalidateQueries({ queryKey: ['/api/dashboard/metrics'] });
    },
    onError: (error: Error) => {
      toast({
        title: "ServiceNow Polling Error",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  const getJiraIntegration = (incidentId: number) => {
    return integrations.find((integration: any) => integration.incidentId === incidentId);
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header isConnected={false} />
        
        <main className="flex-1 overflow-auto p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Active Alerts</h1>
              <p className="text-muted-foreground">
                Monitor and manage active security and infrastructure incidents
              </p>
            </div>
            <div className="flex gap-2">
              <Button 
                onClick={handleRefresh}
                disabled={isRefreshing || isLoading}
                variant="outline"
                size="sm"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
                {isRefreshing ? 'Refreshing...' : 'Refresh'}
              </Button>
              
              {serviceNowConfig?.isActive && (
                <Button 
                  onClick={() => pollServiceNowMutation.mutate()}
                  disabled={pollServiceNowMutation.isPending}
                  variant="outline"
                  size="sm"
                >
                  <Cloud className={`h-4 w-4 mr-2 ${pollServiceNowMutation.isPending ? 'animate-spin' : ''}`} />
                  {pollServiceNowMutation.isPending ? 'Polling...' : 'Poll ServiceNow'}
                </Button>
              )}
            </div>
          </div>

          {isLoading ? (
            <div className="grid gap-4">
              {[...Array(3)].map((_, i) => (
                <Card key={i} className="animate-pulse">
                  <CardContent className="p-6">
                    <div className="h-4 bg-muted rounded w-3/4 mb-2"></div>
                    <div className="h-3 bg-muted rounded w-1/2"></div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="grid gap-4">
              {incidents.map((incident: any) => (
                <Card key={incident.id} className="hover:shadow-md transition-shadow">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5 text-orange-500" />
                        {incident.title}
                      </CardTitle>
                      <div className="flex gap-2">
                        <Badge variant={getSeverityColor(incident.severity)}>
                          {incident.severity.toUpperCase()}
                        </Badge>
                        <Badge variant={getStatusColor(incident.status)}>
                          {incident.status.toUpperCase()}
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <p className="text-muted-foreground mb-4">{incident.description}</p>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">Started:</span>
                        <span>{new Date(incident.startedAt).toLocaleString()}</span>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">Incident ID:</span>
                        <span className="font-mono">{incident.incidentId}</span>
                      </div>
                      
                      {incident.aiConfidence && (
                        <div className="flex items-center gap-2">
                          <TrendingUp className="h-4 w-4 text-muted-foreground" />
                          <span className="text-muted-foreground">AI Confidence:</span>
                          <span>{incident.aiConfidence}%</span>
                        </div>
                      )}
                    </div>

                    {incident.affectedSystems && incident.affectedSystems.length > 0 && (
                      <div className="mt-4">
                        <span className="text-sm text-muted-foreground">Affected Systems:</span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {incident.affectedSystems.map((system: string, index: number) => (
                            <Badge key={index} variant="outline" className="text-xs">
                              {system}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {/* JIRA Integration Section */}
                    <div className="mt-4 pt-4 border-t border-border">
                      {(() => {
                        const jiraIntegration = getJiraIntegration(incident.id);
                        if (jiraIntegration) {
                          return (
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Ticket className="h-4 w-4 text-blue-500" />
                                <span className="text-sm font-medium">JIRA Ticket:</span>
                                <Badge variant="outline">{jiraIntegration.jiraIssueKey}</Badge>
                                <Badge variant={jiraIntegration.status === 'Done' ? 'default' : 'secondary'}>
                                  {jiraIntegration.status}
                                </Badge>
                              </div>
                              {jiraIntegration.metadata?.jiraUrl && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => window.open(jiraIntegration.metadata.jiraUrl, '_blank')}
                                >
                                  <ExternalLink className="h-3 w-3 mr-1" />
                                  Open
                                </Button>
                              )}
                            </div>
                          );
                        } else {
                          return (
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Ticket className="h-4 w-4 text-muted-foreground" />
                                <span className="text-sm text-muted-foreground">No JIRA ticket created</span>
                              </div>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => createJiraTicketMutation.mutate(incident.id)}
                                disabled={createJiraTicketMutation.isPending}
                              >
                                {createJiraTicketMutation.isPending ? 'Creating...' : 'Create JIRA Ticket'}
                              </Button>
                            </div>
                          );
                        }
                      })()}
                    </div>
                  </CardContent>
                </Card>
              ))}
              
              {incidents.length === 0 && (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center p-12">
                    <AlertTriangle className="h-12 w-12 text-muted-foreground mb-4" />
                    <h3 className="text-lg font-semibold mb-2">No Active Alerts</h3>
                    <p className="text-muted-foreground text-center">
                      All systems are operating normally. Active incidents will appear here when detected.
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}