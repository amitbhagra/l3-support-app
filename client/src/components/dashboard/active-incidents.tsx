import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Clock, Bot, Search, Settings, ExternalLink } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function ActiveIncidents() {
  const { toast } = useToast();
  
  const { data: incidents, isLoading } = useQuery({
    queryKey: ['/api/active-alerts'],
  });

  const createJiraTicketMutation = useMutation({
    mutationFn: async (incidentId: number) => {
      return apiRequest('POST', `/api/jira/integrations/create/${incidentId}`);
    },
    onSuccess: (data: any) => {
      toast({
        title: "Jira Ticket Created",
        description: `Successfully created ticket ${data.jiraIssue.key} for this incident.`
      });
      queryClient.invalidateQueries({ queryKey: ['/api/incidents'] });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Create Ticket",
        description: error.message || "Unable to create Jira ticket. Please check your Jira configuration.",
        variant: "destructive"
      });
    }
  });

  const criticalIncidents = Array.isArray(incidents) ? incidents.filter((incident: any) => 
    incident.status === 'ACTIVE' || incident.status === 'RESOLVING' || incident.status === 'investigating' || incident.status === 'escalated'
  ).slice(0, 3) : [];

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'CRITICAL': return 'bg-error text-error-foreground';
      case 'HIGH': return 'bg-warning text-warning-foreground';
      case 'MEDIUM': return 'bg-blue-600 text-white';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'RESOLVING': return Settings;
      default: return status === 'ACTIVE' ? Bot : Search;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'RESOLVING': return 'text-success';
      case 'ACTIVE': return 'text-warning';
      default: return 'text-primary';
    }
  };

  if (isLoading) {
    return (
      <Card className="bg-surface border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-semibold">Critical Incidents</h3>
            <Button variant="ghost" size="sm">View All</Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="border border-border rounded-lg p-4">
              <div className="animate-pulse space-y-2">
                <div className="h-4 bg-muted rounded w-24"></div>
                <div className="h-5 bg-muted rounded w-3/4"></div>
                <div className="h-4 bg-muted rounded w-full"></div>
                <div className="h-3 bg-muted rounded w-1/2"></div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-surface border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-semibold">Critical Incidents</h3>
          <Button variant="ghost" size="sm" className="text-primary hover:text-primary/80">
            View All
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {criticalIncidents.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-muted-foreground">No critical incidents at this time</p>
          </div>
        ) : (
          criticalIncidents.map((incident: any) => {
            const StatusIcon = getStatusIcon(incident.status);
            const statusColor = getStatusColor(incident.status);
            
            return (
              <div
                key={incident.id}
                className="border border-border rounded-lg p-4 hover:border-border/60 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-2">
                      <Badge className={getSeverityColor(incident.severity)}>
                        {incident.severity}
                      </Badge>
                      <span className="text-sm text-muted-foreground">{incident.incidentId}</span>
                    </div>
                    <h4 className="font-medium mb-1">{incident.title}</h4>
                    <p className="text-sm text-muted-foreground mb-3">{incident.description}</p>
                    <div className="flex items-center space-x-4 text-xs text-muted-foreground">
                      <span className="flex items-center">
                        <Clock className="h-3 w-3 mr-1" />
                        Started {formatDistanceToNow(new Date(incident.startedAt))} ago
                      </span>
                      <span className={`flex items-center ${statusColor}`}>
                        <StatusIcon className="h-3 w-3 mr-1" />
                        {incident.status === 'RESOLVING' ? 'Action Executing' : 
                         incident.status === 'ACTIVE' ? 'AI Processing' : 'RCA in Progress'}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end ml-4 space-y-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => createJiraTicketMutation.mutate(incident.id)}
                      disabled={createJiraTicketMutation.isPending}
                      className="text-xs"
                    >
                      <ExternalLink className="h-3 w-3 mr-1" />
                      {createJiraTicketMutation.isPending ? 'Creating...' : 'Create Ticket'}
                    </Button>
                    <div className="text-right">
                      <div className={`w-3 h-3 rounded-full animate-pulse mb-1 ${
                        incident.status === 'RESOLVING' ? 'bg-success' : 
                        incident.status === 'ACTIVE' ? 'bg-warning' : 'bg-primary'
                      }`}></div>
                      <span className="text-xs text-muted-foreground">
                        Step {incident.currentStep}/{incident.totalSteps}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
