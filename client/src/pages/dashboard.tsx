import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useWebSocket } from "@/lib/websocket";
import { WebSocketMessage } from "@/types/dashboard";
import Sidebar from "@/components/dashboard/sidebar";
import Header from "@/components/dashboard/header";
import MetricsCards from "@/components/dashboard/metrics-cards";
import ActiveIncidents from "@/components/dashboard/active-incidents";
import RcaWorkflow from "@/components/dashboard/rca-workflow";
import RecentActions from "@/components/dashboard/recent-actions";
import KnowledgeBase from "@/components/dashboard/knowledge-base";
import EscalationQueue from "@/components/dashboard/escalation-queue";
import FileUpload from "@/components/file-upload";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export default function Dashboard() {
  const handleWebSocketMessage = (message: WebSocketMessage) => {
    // Invalidate relevant queries based on message type
    switch (message.type) {
      case 'force_refresh':
      case 'dashboard_cleared':
      case 'all_data_cleared':
        // Force refresh all dashboard data
        queryClient.invalidateQueries({ queryKey: ['/api/dashboard/metrics'] });
        queryClient.invalidateQueries({ queryKey: ['/api/incidents'] });
        queryClient.invalidateQueries({ queryKey: ['/api/active-alerts'] });
        queryClient.invalidateQueries({ queryKey: ['/api/actions/recent'] });
        queryClient.invalidateQueries({ queryKey: ['/api/knowledge-base'] });
        queryClient.invalidateQueries({ queryKey: ['/api/escalations'] });
        queryClient.invalidateQueries({ queryKey: ['/api/rca-workflows'] });
        break;
      case 'metrics_updated':
        queryClient.invalidateQueries({ queryKey: ['/api/dashboard/metrics'] });
        break;
      case 'incident_created':
      case 'incident_updated':
        queryClient.invalidateQueries({ queryKey: ['/api/incidents'] });
        queryClient.invalidateQueries({ queryKey: ['/api/active-alerts'] });
        queryClient.invalidateQueries({ queryKey: ['/api/dashboard/metrics'] });
        break;
      case 'rca_workflow_updated':
        queryClient.invalidateQueries({ queryKey: ['/api/incidents'] });
        queryClient.invalidateQueries({ queryKey: ['/api/rca-workflows'] });
        break;
      case 'action_created':
        queryClient.invalidateQueries({ queryKey: ['/api/actions/recent'] });
        break;
      case 'knowledge_base_updated':
        queryClient.invalidateQueries({ queryKey: ['/api/knowledge-base'] });
        break;
      case 'escalation_created':
      case 'escalation_updated':
        queryClient.invalidateQueries({ queryKey: ['/api/escalations'] });
        break;
    }
  };

  const { isConnected } = useWebSocket(handleWebSocketMessage);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header isConnected={isConnected} />
        
        <main className="flex-1 overflow-auto p-6 space-y-6">
          <FileUpload />
          <MetricsCards />
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ActiveIncidents />
            <RcaWorkflow />
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <RecentActions />
            <KnowledgeBase />
          </div>
          
          <EscalationQueue />
        </main>
      </div>
      
      <Button
        className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg bg-primary hover:bg-primary/90"
        size="icon"
      >
        <Plus className="h-6 w-6" />
      </Button>
    </div>
  );
}
