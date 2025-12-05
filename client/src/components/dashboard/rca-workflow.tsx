import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Check, Loader2, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export default function RcaWorkflow() {
  const { data: incidents } = useQuery({
    queryKey: ['/api/incidents'],
  });

  // Get the first active incident for workflow display
  const activeIncident = incidents?.find((incident: any) => 
    incident.status === 'ACTIVE' && incident.incidentId === 'INC-2024-001'
  );

  const { data: workflows } = useQuery({
    queryKey: ['/api/incidents', activeIncident?.id, 'rca'],
    enabled: !!activeIncident?.id,
  });

  const workflowSteps = (workflows || []).sort((a: any, b: any) => a.step - b.step);

  const getStepIcon = (status: string) => {
    switch (status) {
      case 'COMPLETED': return Check;
      case 'IN_PROGRESS': return Loader2;
      default: return null;
    }
  };

  const getStepColor = (status: string) => {
    switch (status) {
      case 'COMPLETED': return 'text-success bg-success/20';
      case 'IN_PROGRESS': return 'text-warning bg-warning/20';
      case 'FAILED': return 'text-error bg-error/20';
      default: return 'text-muted-foreground bg-muted/20';
    }
  };

  const getStepTextColor = (status: string) => {
    switch (status) {
      case 'COMPLETED': return 'text-success';
      case 'IN_PROGRESS': return 'text-warning';
      case 'FAILED': return 'text-error';
      default: return 'text-muted-foreground';
    }
  };

  if (!activeIncident) {
    return (
      <Card className="bg-surface border-border">
        <CardHeader className="pb-3">
          <h3 className="text-xl font-semibold">RCA Workflow</h3>
          <p className="text-sm text-muted-foreground">No active incidents for workflow display</p>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <p className="text-muted-foreground">Workflow will appear when incidents are detected</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-surface border-border">
      <CardHeader className="pb-3">
        <h3 className="text-xl font-semibold">RCA Workflow - {activeIncident.incidentId}</h3>
        <p className="text-sm text-muted-foreground mt-1">{activeIncident.title}</p>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {workflowSteps.map((step: any, index: number) => {
            const StepIcon = getStepIcon(step.status);
            const stepColor = getStepColor(step.status);
            const textColor = getStepTextColor(step.status);
            
            return (
              <div key={step.id} className="flex items-start space-x-4">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm ${stepColor}`}>
                  {StepIcon ? (
                    <StepIcon className={`h-4 w-4 ${step.status === 'IN_PROGRESS' ? 'animate-spin' : ''}`} />
                  ) : (
                    <span className="text-muted-foreground">{step.step}</span>
                  )}
                </div>
                <div className="flex-1">
                  <h4 className={`font-medium ${textColor}`}>{step.stepName}</h4>
                  <p className="text-sm text-muted-foreground mt-1">
                    {step.details || `${step.stepName} details`}
                  </p>
                  
                  {step.step === 3 && step.status === 'IN_PROGRESS' && (
                    <div className="mt-3 bg-muted rounded p-3 font-mono text-xs">
                      <div className="text-warning">🔍 Pattern detected: Full table scan on orders table</div>
                      <div className="text-muted-foreground mt-1">⚠️ Missing index on created_at column</div>
                      <div className="text-primary mt-1">💡 Confidence: {step.confidence}%</div>
                    </div>
                  )}
                  
                  <div className="text-xs text-muted-foreground mt-2">
                    <Clock className="h-3 w-3 inline mr-1" />
                    {step.status === 'COMPLETED' && step.duration ? 
                      `Completed in ${step.duration}s` :
                      step.status === 'IN_PROGRESS' ? 
                        `In progress (${formatDistanceToNow(new Date(step.startedAt))})` :
                        step.status === 'PENDING' ? 'Pending' : 'Waiting for previous step'
                    }
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
