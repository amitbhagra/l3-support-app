import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Clock, TrendingUp, Users } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { apiRequest } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function EscalationQueue() {
  const { toast } = useToast();
  
  const { data: escalations, isLoading } = useQuery({
    queryKey: ['/api/escalations'],
  });

  const acceptEscalationMutation = useMutation({
    mutationFn: (escalationId: number) => 
      apiRequest('PUT', `/api/escalations/${escalationId}`, { 
        status: 'ACCEPTED',
        assignedTo: 'Admin User'
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/escalations'] });
      toast({
        title: "Escalation Accepted",
        description: "You have successfully accepted the escalation.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to accept escalation. Please try again.",
        variant: "destructive",
      });
    }
  });

  const assignEscalationMutation = useMutation({
    mutationFn: (escalationId: number) => 
      apiRequest('PUT', `/api/escalations/${escalationId}`, { 
        status: 'ASSIGNED',
        assignedTo: 'Network Team'
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/escalations'] });
      toast({
        title: "Escalation Assigned",
        description: "Escalation has been assigned to the network team.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to assign escalation. Please try again.",
        variant: "destructive",
      });
    }
  });

  const pendingEscalations = escalations?.filter((e: any) => e.status === 'PENDING') || [];

  const handleAcceptEscalation = (escalationId: number) => {
    acceptEscalationMutation.mutate(escalationId);
  };

  const handleAssignEscalation = (escalationId: number) => {
    assignEscalationMutation.mutate(escalationId);
  };

  if (isLoading) {
    return (
      <Card className="bg-surface border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-semibold">Human Escalation Queue</h3>
            <div className="flex items-center space-x-2">
              <Badge variant="secondary">Loading...</Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            <div className="h-32 bg-muted rounded-lg"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-surface border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-semibold">Human Escalation Queue</h3>
          <div className="flex items-center space-x-2">
            {pendingEscalations.length > 0 && (
              <Badge className="bg-warning/20 text-warning">
                {pendingEscalations.length} Pending
              </Badge>
            )}
            <Button variant="ghost" size="sm" className="text-primary hover:text-primary/80">
              Manage
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {pendingEscalations.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-muted-foreground">No pending escalations</p>
          </div>
        ) : (
          <div className="space-y-6">
            {pendingEscalations.map((escalation: any) => (
              <div
                key={escalation.id}
                className="border border-warning/30 rounded-lg p-6 bg-warning/5"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-3">
                      <Badge className="bg-warning text-warning-foreground font-medium">
                        ESCALATED
                      </Badge>
                      <span className="text-sm text-muted-foreground">INC-2024-004</span>
                      <span className="text-sm text-muted-foreground">•</span>
                      <span className="text-sm text-muted-foreground">Network Infrastructure</span>
                    </div>
                    <h4 className="text-lg font-semibold mb-2">{escalation.title}</h4>
                    <p className="text-muted-foreground mb-4">{escalation.description}</p>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                      <div className="bg-muted rounded-lg p-4">
                        <h5 className="font-medium mb-2">AI Analysis Summary</h5>
                        <div className="text-sm text-muted-foreground">
                          <p>{escalation.aiAnalysis}</p>
                        </div>
                      </div>
                      <div className="bg-muted rounded-lg p-4">
                        <h5 className="font-medium mb-2">Recommended Actions</h5>
                        <ul className="text-sm text-muted-foreground space-y-1">
                          {escalation.recommendedActions?.map((action: string, index: number) => (
                            <li key={index}>• {action}</li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    <div className="flex items-center space-x-6 text-sm text-muted-foreground">
                      <span className="flex items-center">
                        <Clock className="h-4 w-4 mr-2" />
                        Escalated {formatDistanceToNow(new Date(escalation.escalatedAt))} ago
                      </span>
                      <span className="flex items-center">
                        <TrendingUp className="h-4 w-4 mr-2" />
                        Impact: {escalation.impact}
                      </span>
                      <span className="flex items-center">
                        <Users className="h-4 w-4 mr-2" />
                        Affected Services: {escalation.affectedServices}
                      </span>
                    </div>
                  </div>
                  <div className="ml-6 flex flex-col space-y-2">
                    <Button 
                      className="bg-primary text-primary-foreground hover:bg-primary/90"
                      onClick={() => handleAcceptEscalation(escalation.id)}
                      disabled={acceptEscalationMutation.isPending}
                    >
                      {acceptEscalationMutation.isPending ? 'Accepting...' : 'Accept'}
                    </Button>
                    <Button 
                      variant="outline" 
                      className="border-border text-foreground hover:bg-accent"
                      onClick={() => handleAssignEscalation(escalation.id)}
                      disabled={assignEscalationMutation.isPending}
                    >
                      {assignEscalationMutation.isPending ? 'Assigning...' : 'Assign'}
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
