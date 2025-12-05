import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useWebSocket } from "@/lib/websocket";
import { WebSocketMessage } from "@/types/dashboard";
import Header from "@/components/dashboard/header";
import Sidebar from "@/components/dashboard/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { Check, Database, Undo, Server, Cloud, Clock, Settings, AlertTriangle, PlayCircle, CheckCircle, FileText, GitBranch, Code, Ticket } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

export default function ActionsPage() {
  
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const handleWebSocketMessage = (message: WebSocketMessage) => {
    // Invalidate relevant queries based on message type
    switch (message.type) {
      case 'action_created':
      case 'action_updated':
      case 'actions_updated':
        queryClient.invalidateQueries({ queryKey: ['/api/actions/recent'] });
        break;
      case 'incident_created':
      case 'incident_updated':
        queryClient.invalidateQueries({ queryKey: ['/api/incidents'] });
        break;
    }
  };

  const { isConnected } = useWebSocket(handleWebSocketMessage);

  const { data: actions, isLoading: actionsLoading } = useQuery({
    queryKey: ['/api/actions/recent'],
    refetchInterval: 5000, // Refresh every 5 seconds
  });

  const { data: incidents, isLoading: incidentsLoading } = useQuery({
    queryKey: ['/api/incidents'],
    refetchInterval: 5000, // Refresh every 5 seconds
  });

  const approveMutation = useMutation({
    mutationFn: async ({ actionId, autoApply }: { actionId: number, autoApply: boolean }) => {
      const res = await apiRequest('POST', `/api/actions/${actionId}/approve`, { autoApply });
      return await res.json();
    },
    onSuccess: (data) => {
      const successMessage = data.githubIntegration?.success 
        ? `Pull request created: ${data.githubIntegration.pullRequestUrl}`
        : `Changes applied locally to ${data.filePath}`;
      
      toast({
        title: data.githubIntegration?.success ? "GitHub PR Created" : "Code Changes Applied",
        description: successMessage,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/actions/recent'] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to apply code changes",
        variant: "destructive",
      });
    }
  });

  const isLoading = actionsLoading || incidentsLoading;

  const getActionIcon = (actionType: string) => {
    switch (actionType) {
      case 'SERVICE_RESTART': return Server;
      case 'APPLICATION_RESTART': return Server;
      case 'INDEX_CREATION': return Database;
      case 'DATABASE_QUERY': return Database;
      case 'DATABASE_OPERATION': return Database;
      case 'DATABASE_SCHEMA_FIX': return Database;
      case 'DATABASE_CLEANUP': return Database;
      case 'ROLLBACK_DEPLOYMENT': return Undo;
      case 'JVM_TUNING': return Settings;
      case 'MEMORY_ANALYSIS': return Settings;
      case 'MONITORING': return AlertTriangle;
      case 'APPLICATION_FIX': return Settings;
      case 'CONFIGURATION_AUDIT': return Settings;
      case 'LOG_ANALYSIS': return Database;
      case 'SYSTEM_HEALTH_CHECK': return CheckCircle;
      case 'CODE_IMPLEMENTATION': return Code;
      case 'INVESTIGATION': return AlertTriangle;
      case 'SERVICENOW_SYNC': return Cloud;
      default: return Check;
    }
  };

  const getActionColor = (actionType: string) => {
    switch (actionType) {
      case 'SERVICE_RESTART': 
      case 'APPLICATION_RESTART': return 'text-green-600 bg-green-100';
      case 'DATABASE_QUERY':
      case 'DATABASE_OPERATION':
      case 'DATABASE_SCHEMA_FIX':
      case 'DATABASE_CLEANUP':
      case 'INDEX_CREATION': return 'text-blue-600 bg-blue-100';
      case 'JVM_TUNING':
      case 'MEMORY_ANALYSIS': return 'text-purple-600 bg-purple-100';
      case 'ROLLBACK_DEPLOYMENT': return 'text-orange-600 bg-orange-100';
      case 'MONITORING': return 'text-yellow-600 bg-yellow-100';
      case 'APPLICATION_FIX':
      case 'CONFIGURATION_AUDIT':
      case 'LOG_ANALYSIS':
      case 'SYSTEM_HEALTH_CHECK': return 'text-indigo-600 bg-indigo-100';
      case 'CODE_IMPLEMENTATION': return 'text-emerald-600 bg-emerald-100';
      case 'INVESTIGATION': return 'text-amber-600 bg-amber-100';
      case 'SERVICENOW_SYNC': return 'text-cyan-600 bg-cyan-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'SUCCESS': return { variant: 'default' as const, className: 'bg-green-100 text-green-800', label: 'SUCCESS' };
      case 'APPROVED': return { variant: 'default' as const, className: 'bg-blue-100 text-blue-800', label: 'APPROVED' };
      case 'PENDING': return { variant: 'secondary' as const, className: 'bg-yellow-100 text-yellow-800', label: 'PENDING' };
      case 'ROLLBACK': return { variant: 'default' as const, className: 'bg-orange-100 text-orange-800', label: 'ROLLBACK' };
      case 'FAILED': return { variant: 'destructive' as const, className: 'bg-red-100 text-red-800', label: 'FAILED' };
      default: return { variant: 'secondary' as const, className: '', label: status };
    }
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'CRITICAL': return { className: 'bg-red-100 text-red-800', label: 'CRITICAL' };
      case 'HIGH': return { className: 'bg-orange-100 text-orange-800', label: 'HIGH' };
      case 'MEDIUM': return { className: 'bg-yellow-100 text-yellow-800', label: 'MEDIUM' };
      case 'LOW': return { className: 'bg-green-100 text-green-800', label: 'LOW' };
      default: return { className: 'bg-gray-100 text-gray-800', label: priority || 'MEDIUM' };
    }
  };

  // Group actions by incident
  const incidentActions = React.useMemo(() => {
    if (!actions || !incidents) return [];
    
    return incidents.map((incident: any) => {
      const incidentActionList = actions
        .filter((action: any) => action.incidentId === incident.id)
        .sort((a: any, b: any) => new Date(b.executedAt).getTime() - new Date(a.executedAt).getTime());
      
      return {
        incident,
        actions: incidentActionList
      };
    }).filter((item: any) => item.actions.length > 0);
  }, [actions, incidents]);

  if (isLoading) {
    return (
      <div className="flex h-screen bg-background">
        <Sidebar />
        <div className="flex-1 flex flex-col">
          <Header isConnected={isConnected} />
          <main className="flex-1 p-6 overflow-y-auto">
            <div className="mb-6">
              <h1 className="text-3xl font-bold">AI Actions</h1>
              <p className="text-muted-foreground">Automated actions performed by AI agents</p>
            </div>
            <div className="space-y-6">
              {[...Array(3)].map((_, i) => (
                <Card key={i} className="animate-pulse">
                  <CardHeader>
                    <div className="h-6 bg-muted rounded w-1/3"></div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {[...Array(2)].map((_, j) => (
                        <div key={j} className="h-20 bg-muted rounded"></div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header isConnected={isConnected} />
        <main className="flex-1 p-6 overflow-y-auto">
          <div className="mb-6">
            <h1 className="text-3xl font-bold">AI Actions</h1>
            <p className="text-muted-foreground">
              Automated actions performed by AI agents across all incidents
            </p>
          </div>

          <div className="space-y-6">
            {incidentActions.length === 0 ? (
              <Card>
                <CardContent className="py-12">
                  <div className="text-center">
                    <PlayCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-medium mb-2">No Actions Yet</h3>
                    <p className="text-muted-foreground">
                      Actions will appear here when AI agents begin processing incidents
                    </p>
                  </div>
                </CardContent>
              </Card>
            ) : (
              incidentActions.map(({ incident, actions: incidentActionList }) => (
                <Card key={incident.id} className="border border-border">
                  <CardHeader className="pb-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <span className="text-sm font-bold text-primary">
                            {incident.incidentId?.split('-')[1]?.slice(-3) || incident.incidentId?.slice(-3) || '???'}
                          </span>
                        </div>
                        <div>
                          <CardTitle className="text-lg">{incident.incidentId}</CardTitle>
                          <p className="text-sm text-muted-foreground">{incident.title}</p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Badge variant="outline" className="text-xs">
                          {incidentActionList.length} action{incidentActionList.length !== 1 ? 's' : ''}
                        </Badge>
                        <Badge 
                          variant="outline" 
                          className={
                            incident.severity === 'CRITICAL' ? 'border-red-200 bg-red-50 text-red-700' :
                            incident.severity === 'HIGH' ? 'border-orange-200 bg-orange-50 text-orange-700' :
                            incident.severity === 'MEDIUM' ? 'border-yellow-200 bg-yellow-50 text-yellow-700' :
                            'border-green-200 bg-green-50 text-green-700'
                          }
                        >
                          {incident.severity}
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                  
                  <CardContent>
                    <div className="space-y-4">
                      {incidentActionList.map((action: any) => {
                        const ActionIcon = getActionIcon(action.actionType);
                        const actionColor = getActionColor(action.actionType);
                        const statusBadge = getStatusBadge(action.status);
                        const priorityBadge = getPriorityBadge(action.metadata?.priority);
                        
                        return (
                          <div
                            key={action.id}
                            className="flex items-start space-x-4 p-4 border border-border/50 rounded-lg bg-card/50"
                          >
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${actionColor}`}>
                              <ActionIcon className="h-5 w-5" />
                            </div>
                            <div className="flex-1">
                              <div className="flex items-start justify-between mb-2">
                                <div className="flex-1">
                                  <h4 className="font-semibold text-base">{action.title}</h4>
                                  <p className="text-sm text-muted-foreground mt-1">{action.description}</p>
                                </div>
                                <div className="flex items-center space-x-2 ml-4">
                                  <Badge className={priorityBadge.className} variant="outline">
                                    {priorityBadge.label}
                                  </Badge>
                                  <Badge className={statusBadge.className} variant={statusBadge.variant}>
                                    {statusBadge.label}
                                  </Badge>
                                  {/* Show approve button for code-specific actions that are not already approved */}
                                  {(action.actionType === 'CODE_IMPLEMENTATION' || action.metadata?.source_type === 'code') && action.status !== 'APPROVED' && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => {
                                        approveMutation.mutate({ actionId: action.id, autoApply: true });
                                      }}
                                      disabled={approveMutation.isPending}
                                      className="flex items-center space-x-1"
                                    >
                                      <Check className="h-4 w-4 mr-1" />
                                      {approveMutation.isPending ? "Creating PR..." : "Approve & Create PR"}
                                    </Button>
                                  )}
                                  
                                  {/* Show GitHub PR link if available */}
                                  {action.metadata?.githubPullRequest && (
                                    <div className="mt-2 p-2 bg-green-50 dark:bg-green-900/20 rounded border border-green-200 dark:border-green-800">
                                      <p className="text-sm text-green-800 dark:text-green-200">
                                        GitHub PR Created: 
                                        <a 
                                          href={action.metadata.githubPullRequest.url} 
                                          target="_blank" 
                                          rel="noopener noreferrer"
                                          className="ml-1 text-green-600 dark:text-green-400 hover:underline"
                                        >
                                          #{action.metadata.githubPullRequest.number}
                                        </a>
                                      </p>
                                    </div>
                                  )}
                                  
                                  {/* Show JIRA ticket closure status */}
                                  {action.metadata?.jiraTicketClosed && (
                                    <div className="mt-2 p-2 bg-blue-50 dark:bg-blue-900/20 rounded border border-blue-200 dark:border-blue-800">
                                      <p className="text-sm text-blue-800 dark:text-blue-200">
                                        <Ticket className="h-3 w-3 inline mr-1" />
                                        JIRA ticket automatically closed
                                      </p>
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center space-x-4 text-xs text-muted-foreground">
                                <span className="flex items-center">
                                  <Clock className="h-3 w-3 mr-1" />
                                  {formatDistanceToNow(new Date(action.executedAt))} ago
                                </span>
                                <span className="flex items-center">
                                  <Server className="h-3 w-3 mr-1" />
                                  {action.target}
                                </span>
                                {action.metadata?.estimated_time && (
                                  <span className="flex items-center">
                                    <Clock className="h-3 w-3 mr-1" />
                                    Est. {action.metadata.estimated_time}
                                  </span>
                                )}
                                {action.metadata?.confidence && (
                                  <span className="flex items-center">
                                    <CheckCircle className="h-3 w-3 mr-1" />
                                    {action.metadata.confidence}% confidence
                                  </span>
                                )}
                                {action.metadata?.source_document && (
                                  <span className="flex items-center">
                                    <FileText className="h-3 w-3 mr-1" />
                                    {action.metadata.source_document}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </main>
      </div>

    </div>
  );
}