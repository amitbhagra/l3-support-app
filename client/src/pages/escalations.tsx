import { useQuery } from "@tanstack/react-query";
import Header from "@/components/dashboard/header";
import Sidebar from "@/components/dashboard/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, AlertTriangle, Clock, CheckCircle, UserCheck } from "lucide-react";

export default function Escalations() {
  const { data: escalations, isLoading } = useQuery({
    queryKey: ['/api/escalations'],
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'assigned': return <UserCheck className="h-4 w-4 text-blue-500" />;
      case 'pending': return <Clock className="h-4 w-4 text-yellow-500" />;
      case 'resolved': return <CheckCircle className="h-4 w-4 text-green-500" />;
      default: return <AlertTriangle className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'assigned': return 'secondary';
      case 'pending': return 'destructive';
      case 'resolved': return 'default';
      default: return 'outline';
    }
  };

  const getImpactColor = (impact: string) => {
    if (impact.toLowerCase().includes('high')) return 'destructive';
    if (impact.toLowerCase().includes('medium')) return 'secondary';
    return 'outline';
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header isConnected={false} />
        
        <main className="flex-1 overflow-auto p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Escalations</h1>
              <p className="text-muted-foreground">
                Human intervention requests when AI confidence is low or manual oversight is required
              </p>
            </div>
          </div>

          {isLoading ? (
            <div className="grid gap-4">
              {[...Array(2)].map((_, i) => (
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
              {escalations?.map((escalation: any) => (
                <Card key={escalation.id} className="hover:shadow-md transition-shadow border-l-4 border-l-orange-500">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Users className="h-5 w-5 text-orange-500" />
                        {escalation.title}
                      </CardTitle>
                      <div className="flex gap-2">
                        <Badge variant={getImpactColor(escalation.impact)}>
                          {escalation.impact.split(' - ')[0]}
                        </Badge>
                        <Badge variant={getStatusColor(escalation.status)}>
                          {getStatusIcon(escalation.status)}
                          <span className="ml-1">{escalation.status.toUpperCase()}</span>
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0 space-y-4">
                    <p className="text-muted-foreground">{escalation.description}</p>
                    
                    <div className="bg-muted/50 p-4 rounded-lg space-y-3">
                      <div>
                        <h4 className="font-semibold text-sm mb-1">Escalation Reason</h4>
                        <p className="text-sm text-muted-foreground">{escalation.reason}</p>
                      </div>
                      
                      {escalation.aiAnalysis && (
                        <div>
                          <h4 className="font-semibold text-sm mb-1">AI Analysis</h4>
                          <p className="text-sm text-muted-foreground">{escalation.aiAnalysis}</p>
                        </div>
                      )}
                      
                      {escalation.recommendedActions && escalation.recommendedActions.length > 0 && (
                        <div>
                          <h4 className="font-semibold text-sm mb-2">Recommended Actions</h4>
                          <div className="flex flex-wrap gap-1">
                            {escalation.recommendedActions.map((action: string, index: number) => (
                              <Badge key={index} variant="outline" className="text-xs">
                                {action.replace('_', ' ')}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">Escalated:</span>
                        <span>{new Date(escalation.escalatedAt).toLocaleString()}</span>
                      </div>
                      
                      {escalation.assignedTo && (
                        <div className="flex items-center gap-2">
                          <UserCheck className="h-4 w-4 text-muted-foreground" />
                          <span className="text-muted-foreground">Assigned to:</span>
                          <span className="font-medium">{escalation.assignedTo}</span>
                        </div>
                      )}
                      
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">Incident:</span>
                        <span className="font-mono">INC-{String(escalation.incidentId).padStart(3, '0')}</span>
                      </div>
                    </div>
                    
                    <div className="text-sm">
                      <span className="text-muted-foreground">Impact: </span>
                      <span>{escalation.impact}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
              
              {!escalations || escalations.length === 0 && (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center p-12">
                    <Users className="h-12 w-12 text-muted-foreground mb-4" />
                    <h3 className="text-lg font-semibold mb-2">No Active Escalations</h3>
                    <p className="text-muted-foreground text-center">
                      The AI system is handling all incidents autonomously. Escalations will appear here when human intervention is needed.
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