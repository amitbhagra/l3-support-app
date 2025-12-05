import { useQuery } from "@tanstack/react-query";
import Header from "@/components/dashboard/header";
import Sidebar from "@/components/dashboard/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BookOpen, FileText, Lightbulb, TrendingUp } from "lucide-react";

export default function Knowledge() {
  const { data: knowledgeBase, isLoading } = useQuery({
    queryKey: ['/api/knowledge-base'],
  });

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'solution': return <Lightbulb className="h-4 w-4 text-yellow-500" />;
      case 'pattern': return <TrendingUp className="h-4 w-4 text-blue-500" />;
      case 'escalation': return <FileText className="h-4 w-4 text-orange-500" />;
      default: return <BookOpen className="h-4 w-4 text-gray-500" />;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'solution': return 'default';
      case 'pattern': return 'secondary';
      case 'escalation': return 'destructive';
      default: return 'outline';
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header isConnected={false} />
        
        <main className="flex-1 overflow-auto p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Knowledge Base</h1>
              <p className="text-muted-foreground">
                AI-generated knowledge repository from resolved incidents and patterns
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
            <div className="grid gap-4">
              {knowledgeBase?.map((entry: any) => (
                <Card key={entry.id} className="hover:shadow-md transition-shadow">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg flex items-center gap-2">
                        {getTypeIcon(entry.type)}
                        {entry.title}
                      </CardTitle>
                      <div className="flex gap-2">
                        <Badge variant={getTypeColor(entry.type)}>
                          {entry.type.toUpperCase()}
                        </Badge>
                        {entry.confidence && (
                          <Badge variant="outline">
                            {entry.confidence}% Confidence
                          </Badge>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <p className="text-muted-foreground mb-4 leading-relaxed">{entry.description}</p>
                    
                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                      <span>Last updated: {new Date(entry.updatedAt).toLocaleDateString()}</span>
                      <span>Type: {entry.type.charAt(0).toUpperCase() + entry.type.slice(1)} Entry</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
              
              {!knowledgeBase || knowledgeBase.length === 0 && (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center p-12">
                    <BookOpen className="h-12 w-12 text-muted-foreground mb-4" />
                    <h3 className="text-lg font-semibold mb-2">No Knowledge Entries</h3>
                    <p className="text-muted-foreground text-center">
                      The AI system will automatically generate knowledge entries as it learns from incident resolutions and patterns.
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