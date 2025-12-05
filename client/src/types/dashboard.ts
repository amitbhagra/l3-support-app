export interface DashboardMetrics {
  activeIncidents: number;
  resolvedToday: number;
  avgResolutionTime: number;
  aiConfidence: number;
}

export interface WorkflowStep {
  step: number;
  stepName: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  duration?: number;
  details?: string;
  confidence?: number;
}

export interface WebSocketMessage {
  type: string;
  data: any;
  timestamp?: string;
  message?: string;
}
