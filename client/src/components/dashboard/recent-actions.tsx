import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, Database, Undo, Server, Cloud, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export default function RecentActions() {
  const { data: actions, isLoading: actionsLoading } = useQuery({
    queryKey: ['/api/actions/recent'],
  });

  const { data: incidents, isLoading: incidentsLoading } = useQuery({
    queryKey: ['/api/incidents'],
  });

  const isLoading = actionsLoading || incidentsLoading;

  const getActionIcon = (actionType: string) => {
    switch (actionType) {
      case 'SERVICE_RESTART': return Server;
      case 'INDEX_CREATION': return Database;
      case 'ROLLBACK_DEPLOYMENT': return Undo;
      default: return Check;
    }
  };

  const getActionColor = (actionType: string) => {
    switch (actionType) {
      case 'SERVICE_RESTART': return 'text-success bg-success/20';
      case 'INDEX_CREATION': return 'text-primary bg-primary/20';
      case 'ROLLBACK_DEPLOYMENT': return 'text-warning bg-warning/20';
      default: return 'text-muted-foreground bg-muted/20';
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'SUCCESS': return { variant: 'default' as const, className: 'bg-success/20 text-success', label: 'SUCCESS' };
      case 'ROLLBACK': return { variant: 'default' as const, className: 'bg-warning/20 text-warning', label: 'ROLLBACK' };
      case 'FAILED': return { variant: 'destructive' as const, className: '', label: 'FAILED' };
      case 'PENDING': return { variant: 'secondary' as const, className: 'bg-yellow-100 text-yellow-800', label: 'PENDING' };
      default: return { variant: 'secondary' as const, className: '', label: status };
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
      <Card className="bg-surface border-border">
        <CardHeader className="pb-3">
          <h3 className="text-xl font-semibold">Recent AI Actions</h3>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex items-start space-x-4 pb-4 border-b border-border last:border-b-0">
                <div className="w-8 h-8 bg-muted rounded-full"></div>
                <div className="flex-1 animate-pulse space-y-2">
                  <div className="h-4 bg-muted rounded w-24"></div>
                  <div className="h-4 bg-muted rounded w-3/4"></div>
                  <div className="h-3 bg-muted rounded w-1/2"></div>
                </div>
                <div className="h-6 w-16 bg-muted rounded"></div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-surface border-border">
      <CardHeader className="pb-3">
        <h3 className="text-xl font-semibold">Recent AI Actions</h3>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {incidentActions?.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">No recent actions</p>
            </div>
          ) : (
            incidentActions?.map(({ incident, actions: incidentActionList }) => (
              <div key={incident.id} className="border border-border rounded-lg p-4 bg-card">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <span className="text-sm font-medium text-primary">
                        {incident.incidentId?.split('-')[1]?.slice(-3) || incident.incidentId?.slice(-3) || '???'}
                      </span>
                    </div>
                    <div>
                      <h3 className="font-medium text-sm">{incident.incidentId}</h3>
                      <p className="text-xs text-muted-foreground">{incident.title}</p>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {incidentActionList.length} action{incidentActionList.length !== 1 ? 's' : ''}
                  </Badge>
                </div>
                
                <div className="space-y-3">
                  {incidentActionList.map((action: any) => {
                    const ActionIcon = getActionIcon(action.actionType);
                    const actionColor = getActionColor(action.actionType);
                    const statusBadge = getStatusBadge(action.status);
                    
                    return (
                      <div
                        key={action.id}
                        className="flex items-start space-x-3 pb-3 border-b border-border/50 last:border-b-0 last:pb-0"
                      >
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center ${actionColor}`}>
                          <ActionIcon className="h-3 w-3" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <h4 className="font-medium text-sm">{action.title}</h4>
                              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{action.description}</p>
                              <div className="flex items-center space-x-3 mt-2 text-xs text-muted-foreground">
                                <span className="flex items-center">
                                  <Clock className="h-3 w-3 mr-1" />
                                  {formatDistanceToNow(new Date(action.executedAt))} ago
                                </span>
                                <span className="flex items-center">
                                  {action.actionType === 'SERVICE_RESTART' ? (
                                    <Server className="h-3 w-3 mr-1" />
                                  ) : action.actionType === 'INDEX_CREATION' ? (
                                    <Database className="h-3 w-3 mr-1" />
                                  ) : (
                                    <Cloud className="h-3 w-3 mr-1" />
                                  )}
                                  {action.target}
                                </span>
                              </div>
                            </div>
                            <Badge className={statusBadge.className} variant={statusBadge.variant}>
                              {statusBadge.label}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
