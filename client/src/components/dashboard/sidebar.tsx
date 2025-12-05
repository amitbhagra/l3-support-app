import { Link, useLocation } from "wouter";
import { 
  LayoutDashboard, 
  AlertTriangle, 
  Search, 
  Settings, 
  BookOpen, 
  Users,
  Bot,
  Activity,
  FileText,
  Code,
  Link as LinkIcon,
  Cloud
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";

export default function Sidebar() {
  const [location] = useLocation();

  const { data: escalations } = useQuery({
    queryKey: ['/api/escalations'],
  });

  const { data: incidents } = useQuery({
    queryKey: ['/api/incidents'],
  });

  const activeIncidents = incidents?.filter((i: any) => i.status === 'ACTIVE').length || 0;
  const pendingEscalations = escalations?.filter((e: any) => e.status === 'PENDING').length || 0;

  const navItems = [
    { 
      path: "/", 
      icon: LayoutDashboard, 
      label: "Dashboard", 
      active: location === "/" 
    },
    { 
      path: "/alerts", 
      icon: AlertTriangle, 
      label: "Active Alerts", 
      badge: activeIncidents > 0 ? activeIncidents : undefined,
      badgeVariant: "destructive" as const
    },
    { 
      path: "/rca", 
      icon: Search, 
      label: "RCA Engine" 
    },
    { 
      path: "/actions", 
      icon: Settings, 
      label: "Actions" 
    },
    { 
      path: "/knowledge", 
      icon: BookOpen, 
      label: "Knowledge Base" 
    },
    { 
      path: "/documents", 
      icon: FileText, 
      label: "Document Management" 
    },
    { 
      path: "/modified-files", 
      icon: Code, 
      label: "Modified Files" 
    },
    { 
      path: "/escalations", 
      icon: Users, 
      label: "Escalations", 
      badge: pendingEscalations > 0 ? pendingEscalations : undefined,
      badgeVariant: "secondary" as const
    },
    { 
      path: "/jira", 
      icon: LinkIcon, 
      label: "JIRA Integration"
    },
    { 
      path: "/servicenow", 
      icon: Cloud, 
      label: "ServiceNow Integration"
    },
  ];

  return (
    <div className="w-64 bg-surface border-r border-border flex flex-col">
      <div className="p-6 border-b border-border">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
            <Bot className="text-primary-foreground h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Agentic AI</h1>
            <p className="text-sm text-muted-foreground">L3 IT Support</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
        {navItems.map((item) => (
          <Link key={item.path} href={item.path} className={`flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors group ${
            item.active
              ? "bg-primary/20 text-primary border border-primary/30"
              : "hover:bg-accent text-muted-foreground hover:text-foreground"
          }`}>
            <item.icon className="h-5 w-5" />
            <span className="flex-1">{item.label}</span>
            {item.badge && (
              <Badge variant={item.badgeVariant || "default"} className="text-xs">
                {item.badge}
              </Badge>
            )}
          </Link>
        ))}
      </nav>

      <div className="p-4 border-t border-border">
        <div className="flex items-center space-x-2 text-sm">
          <div className="w-2 h-2 bg-success rounded-full animate-pulse"></div>
          <span className="text-muted-foreground">System Operational</span>
        </div>
        <div className="text-xs text-muted-foreground mt-1">Last updated: 2 min ago</div>
      </div>
    </div>
  );
}
