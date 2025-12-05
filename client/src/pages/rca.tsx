import React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useWebSocket } from "@/lib/websocket";
import { WebSocketMessage } from "@/types/dashboard";
import Header from "@/components/dashboard/header";
import Sidebar from "@/components/dashboard/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Search, CheckCircle, Clock, AlertCircle, PlayCircle, FileText } from "lucide-react";

export default function RcaEngine() {
  const queryClient = useQueryClient();
  
  const handleWebSocketMessage = (message: WebSocketMessage) => {
    // Invalidate relevant queries based on message type
    switch (message.type) {
      case 'rca_workflow_created':
      case 'rca_workflow_updated':
      case 'rca_workflows_updated':
        queryClient.invalidateQueries({ queryKey: ['/api/rca-workflows'] });
        break;
      case 'incident_created':
      case 'incident_updated':
        queryClient.invalidateQueries({ queryKey: ['/api/incidents'] });
        break;
    }
  };

  const { isConnected } = useWebSocket(handleWebSocketMessage);

  const { data: workflows, isLoading: workflowsLoading } = useQuery({
    queryKey: ['/api/rca-workflows'],
    refetchInterval: 5000, // Refresh every 5 seconds
  });

  const { data: incidents, isLoading: incidentsLoading } = useQuery({
    queryKey: ['/api/incidents'],
    refetchInterval: 5000, // Refresh every 5 seconds
  });

  const isLoading = workflowsLoading || incidentsLoading;

  // Group workflows by incident
  const incidentWorkflows = React.useMemo(() => {
    if (!workflows || !incidents) return [];
    
    return incidents.map((incident: any) => {
      const incidentSteps = workflows
        .filter((workflow: any) => workflow.incidentId === incident.id)
        .sort((a: any, b: any) => a.step - b.step);
      
      return {
        incident,
        workflows: incidentSteps
      };
    }).filter((item: any) => item.workflows.length > 0);
  }, [workflows, incidents]);

  const getStatusIcon = (status: string) => {
    switch (status?.toUpperCase()) {
      case 'COMPLETED': return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'IN_PROGRESS': return <PlayCircle className="h-4 w-4 text-blue-500" />;
      case 'PENDING': return <Clock className="h-4 w-4 text-yellow-500" />;
      case 'FAILED': return <AlertCircle className="h-4 w-4 text-red-500" />;
      default: return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status?.toUpperCase()) {
      case 'COMPLETED': return 'default';
      case 'IN_PROGRESS': return 'secondary';
      case 'PENDING': return 'outline';
      case 'FAILED': return 'destructive';
      default: return 'outline';
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header isConnected={isConnected} />
        
        <main className="flex-1 overflow-auto p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">RCA Engine</h1>
              <p className="text-muted-foreground">
                Root Cause Analysis workflows and diagnostic processes
              </p>
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
            <div className="space-y-6">
              {incidentWorkflows.map((item: any) => (
                <Card key={item.incident.id} className="hover:shadow-md transition-shadow">
                  <CardHeader className="pb-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <FileText className="h-6 w-6 text-blue-500" />
                        <div>
                          <CardTitle className="text-xl">
                            {item.incident.incidentId}
                          </CardTitle>
                          <p className="text-sm text-muted-foreground mt-1">
                            {item.incident.title}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={item.incident.severity === 'HIGH' ? 'destructive' : 'secondary'}>
                          {item.incident.severity}
                        </Badge>
                        <Badge variant="outline">
                          {item.incident.status}
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <h4 className="font-semibold text-lg mb-3">RCA Workflow Steps</h4>
                      <div className="space-y-3">
                        {item.workflows.map((workflow: any) => (
                          <div key={workflow.id} className="flex items-start gap-4 p-4 rounded-lg border border-border bg-card/50">
                            <div className="flex-shrink-0">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                                workflow.status === 'COMPLETED' ? 'bg-green-100 text-green-700' :
                                workflow.status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-700' :
                                'bg-gray-100 text-gray-700'
                              }`}>
                                {workflow.status === 'COMPLETED' ? (
                                  <CheckCircle className="h-4 w-4" />
                                ) : workflow.status === 'IN_PROGRESS' ? (
                                  <PlayCircle className="h-4 w-4" />
                                ) : (
                                  <Clock className="h-4 w-4" />
                                )}
                              </div>
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center justify-between mb-2">
                                <h5 className="font-medium">
                                  Step {workflow.step}: {workflow.stepName}
                                </h5>
                                <div className="flex items-center gap-2">
                                  <Badge variant={getStatusColor(workflow.status)}>
                                    {workflow.status}
                                  </Badge>
                                  {workflow.confidence && (
                                    <div className="flex items-center gap-1">
                                      <Progress value={workflow.confidence} className="h-2 w-16" />
                                      <span className="text-xs text-muted-foreground">
                                        {workflow.confidence}%
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </div>
                              <p className="text-sm text-muted-foreground mb-2">
                                {workflow.details || 'No details available'}
                              </p>
                              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                <span>
                                  Started: {workflow.startedAt ? new Date(workflow.startedAt).toLocaleTimeString() : 'N/A'}
                                </span>
                                <span>
                                  Duration: {workflow.duration ? `${workflow.duration}s` : 'In progress'}
                                </span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
              
              {incidentWorkflows.length === 0 && (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center p-12">
                    <Search className="h-12 w-12 text-muted-foreground mb-4" />
                    <h3 className="text-lg font-semibold mb-2">No RCA Processes</h3>
                    <p className="text-muted-foreground text-center">
                      Root cause analysis workflows will appear here when incidents are detected.
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