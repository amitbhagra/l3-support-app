import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Lightbulb, BookOpen, AlertTriangle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export default function KnowledgeBase() {
  const { data: entries, isLoading } = useQuery({
    queryKey: ['/api/knowledge-base'],
  });

  const recentEntries = entries?.slice(0, 3) || [];

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'PATTERN': return Lightbulb;
      case 'SOLUTION': return BookOpen;
      case 'ESCALATION_TRIGGER': return AlertTriangle;
      default: return BookOpen;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'PATTERN': return 'text-primary bg-primary/20';
      case 'SOLUTION': return 'text-success bg-success/20';
      case 'ESCALATION_TRIGGER': return 'text-warning bg-warning/20';
      default: return 'text-muted-foreground bg-muted/20';
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'ESCALATION_TRIGGER': return 'Policy updated';
      case 'SOLUTION': return 'Auto-generated';
      default: return `Confidence: ${entries?.find((e: any) => e.type === type)?.confidence}%`;
    }
  };

  if (isLoading) {
    return (
      <Card className="bg-surface border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-semibold">Knowledge Base Updates</h3>
            <Button variant="ghost" size="sm">View All</Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="border border-border rounded-lg p-4">
                <div className="flex items-start space-x-3">
                  <div className="w-8 h-8 bg-muted rounded-full"></div>
                  <div className="flex-1 animate-pulse space-y-2">
                    <div className="h-4 bg-muted rounded w-3/4"></div>
                    <div className="h-4 bg-muted rounded w-full"></div>
                    <div className="h-3 bg-muted rounded w-1/2"></div>
                  </div>
                </div>
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
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-semibold">Knowledge Base Updates</h3>
          <Button variant="ghost" size="sm" className="text-primary hover:text-primary/80">
            View All
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {recentEntries.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">No recent knowledge base updates</p>
            </div>
          ) : (
            recentEntries.map((entry: any) => {
              const TypeIcon = getTypeIcon(entry.type);
              const typeColor = getTypeColor(entry.type);
              
              return (
                <div
                  key={entry.id}
                  className="border border-border rounded-lg p-4 hover:border-border/60 transition-colors"
                >
                  <div className="flex items-start space-x-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${typeColor}`}>
                      <TypeIcon className="h-4 w-4" />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-medium mb-2">{entry.title}</h4>
                      <p className="text-sm text-muted-foreground mb-3">{entry.description}</p>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{getTypeLabel(entry.type)}</span>
                        <span>Updated {formatDistanceToNow(new Date(entry.updatedAt))} ago</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </CardContent>
    </Card>
  );
}
