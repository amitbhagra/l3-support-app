import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, CheckCircle, Clock, Brain, TrendingUp, TrendingDown } from "lucide-react";

export default function MetricsCards() {
  const { data: metrics, isLoading } = useQuery({
    queryKey: ['/api/dashboard/metrics'],
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="bg-surface border-border">
            <CardContent className="p-6">
              <div className="animate-pulse">
                <div className="h-4 bg-muted rounded w-24 mb-2"></div>
                <div className="h-8 bg-muted rounded w-16 mb-4"></div>
                <div className="h-4 bg-muted rounded w-32"></div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const metricsData = [
    {
      title: "Active Incidents",
      value: metrics?.activeIncidents || 0,
      icon: AlertCircle,
      color: "text-error",
      bgColor: "bg-error/20",
      trend: "+2 from last hour",
      trendIcon: TrendingUp,
      trendColor: "text-error"
    },
    {
      title: "Resolved Today",
      value: metrics?.resolvedToday || 0,
      icon: CheckCircle,
      color: "text-success",
      bgColor: "bg-success/20",
      trend: "+15% from yesterday",
      trendIcon: TrendingUp,
      trendColor: "text-success"
    },
    {
      title: "Avg Resolution Time",
      value: `${metrics?.avgResolutionTime || 0}m`,
      icon: Clock,
      color: "text-primary",
      bgColor: "bg-primary/20",
      trend: "-8m from last week",
      trendIcon: TrendingDown,
      trendColor: "text-success"
    },
    {
      title: "AI Confidence",
      value: `${metrics?.aiConfidence || 0}%`,
      icon: Brain,
      color: "text-primary",
      bgColor: "bg-primary/20",
      trend: "+2% from last month",
      trendIcon: TrendingUp,
      trendColor: "text-success"
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {metricsData.map((metric, index) => (
        <Card key={index} className="bg-surface border-border">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{metric.title}</p>
                <p className={`text-3xl font-bold ${metric.color}`}>{metric.value}</p>
              </div>
              <div className={`w-12 h-12 ${metric.bgColor} rounded-full flex items-center justify-center`}>
                <metric.icon className={`${metric.color} h-6 w-6`} />
              </div>
            </div>
            <div className="mt-4 flex items-center text-sm">
              <metric.trendIcon className={`${metric.trendColor} h-4 w-4 mr-2`} />
              <span className={metric.trendColor}>{metric.trend}</span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
