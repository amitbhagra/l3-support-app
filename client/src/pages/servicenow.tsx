import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Clock, Shield, CheckCircle, XCircle, Settings, Activity, AlertTriangle, RefreshCw } from "lucide-react";

// ServiceNow Configuration Schema
const serviceNowConfigSchema = z.object({
  instance: z.string().min(1, "Instance is required"),
  username: z.string().min(1, "Username is required"),
  assignmentGroup: z.string().optional(),
  callerId: z.string().optional(),
  priorityMapping: z.record(z.string()).optional(),
  urgencyMapping: z.record(z.string()).optional(),
  customFields: z.record(z.string()).optional(),
  autoSync: z.boolean().default(true),
  syncInterval: z.number().min(60).default(300),
  pollInterval: z.number().min(30).default(60),
  isActive: z.boolean().default(true),
});

type ServiceNowConfig = z.infer<typeof serviceNowConfigSchema>;

export default function ServiceNowPage() {
  const [testingConnection, setTestingConnection] = useState(false);
  const [pollingIncidents, setPollingIncidents] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [lastPollResults, setLastPollResults] = useState<any>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<ServiceNowConfig>({
    resolver: zodResolver(serviceNowConfigSchema),
    defaultValues: {
      instance: "",
      username: "",
      assignmentGroup: "IT Support",
      callerId: "",
      priorityMapping: {
        "CRITICAL": "1",
        "HIGH": "2",
        "MEDIUM": "3",
        "LOW": "4"
      },
      urgencyMapping: {
        "CRITICAL": "1",
        "HIGH": "2",
        "MEDIUM": "3",
        "LOW": "3"
      },
      customFields: {},
      autoSync: true,
      syncInterval: 300,
      pollInterval: 60,
      isActive: true,
    },
  });

  // Fetch ServiceNow configuration
  const { data: config, isLoading } = useQuery({
    queryKey: ["/api/servicenow/config"],
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Fetch ServiceNow integrations
  const { data: integrations, isLoading: integrationsLoading } = useQuery({
    queryKey: ["/api/servicenow/integrations"],
    staleTime: 30 * 1000, // 30 seconds
  });

  // Update form when config is loaded
  useEffect(() => {
    if (config) {
      form.reset({
        instance: config.instance || "",
        username: config.username || "",
        assignmentGroup: config.assignmentGroup || "IT Support",
        callerId: config.callerId || "",
        priorityMapping: config.priorityMapping || {
          "CRITICAL": "1",
          "HIGH": "2", 
          "MEDIUM": "3",
          "LOW": "4"
        },
        urgencyMapping: config.urgencyMapping || {
          "CRITICAL": "1",
          "HIGH": "2",
          "MEDIUM": "3", 
          "LOW": "3"
        },
        customFields: config.customFields || {},
        autoSync: config.autoSync ?? true,
        syncInterval: config.syncInterval ?? 300,
        pollInterval: config.pollInterval ?? 60,
        isActive: config.isActive ?? true,
      });
    }
  }, [config, form]);

  // Save configuration mutation
  const saveConfigMutation = useMutation({
    mutationFn: async (data: ServiceNowConfig) => {
      const method = config ? "PUT" : "POST";
      const response = await apiRequest(method, `/api/servicenow/config`, data);
      return await response.json();
    },
    onSuccess: () => {
      toast({
        title: "Configuration saved",
        description: "ServiceNow configuration has been saved successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/servicenow/config"] });
    },
    onError: (error: any) => {
      toast({
        title: "Configuration failed",
        description: error.message || "Failed to save ServiceNow configuration.",
        variant: "destructive",
      });
    },
  });

  // Test connection mutation
  const testConnectionMutation = useMutation({
    mutationFn: async (data: ServiceNowConfig) => {
      const response = await apiRequest("POST", `/api/servicenow/test-connection`, data);
      return await response.json();
    },
    onSuccess: (data) => {
      setConnectionStatus(data.connected ? 'success' : 'error');
      toast({
        title: data.connected ? "Connection successful" : "Connection failed",
        description: data.connected 
          ? "Successfully connected to ServiceNow instance."
          : data.error || "Failed to connect to ServiceNow.",
        variant: data.connected ? "default" : "destructive",
      });
    },
    onError: (error: any) => {
      setConnectionStatus('error');
      toast({
        title: "Connection test failed",
        description: error.message || "Failed to test ServiceNow connection.",
        variant: "destructive",
      });
    },
  });

  // Poll incidents mutation
  const pollIncidentsMutation = useMutation({
    mutationFn: async (sinceMinutes: number = 5) => {
      const response = await apiRequest("GET", `/api/servicenow/poll-incidents?since=${sinceMinutes}`);
      return await response.json();
    },
    onSuccess: (data) => {
      setLastPollResults(data);
      toast({
        title: "Incidents polled",
        description: `Found ${data.newIncidents} new incidents from ServiceNow.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/incidents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/active-alerts"] });
    },
    onError: (error: any) => {
      toast({
        title: "Polling failed",
        description: error.message || "Failed to poll ServiceNow incidents.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = async (data: ServiceNowConfig) => {
    console.log("Form data being submitted:", data);
    console.log("Form errors:", form.formState.errors);
    saveConfigMutation.mutate(data);
  };

  const handleTestConnection = async () => {
    const formData = form.getValues();
    setTestingConnection(true);
    await testConnectionMutation.mutateAsync(formData);
    setTestingConnection(false);
  };

  const handlePollIncidents = async () => {
    setPollingIncidents(true);
    await pollIncidentsMutation.mutateAsync(5);
    setPollingIncidents(false);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">ServiceNow Integration</h1>
          <p className="text-muted-foreground mt-2">
            Configure ServiceNow integration for incident management and automated polling
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            onClick={handlePollIncidents}
            disabled={pollingIncidents || !config?.isActive}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${pollingIncidents ? 'animate-spin' : ''}`} />
            Poll Incidents
          </Button>
          <Badge variant={config?.isActive ? "default" : "secondary"}>
            {config?.isActive ? "Active" : "Inactive"}
          </Badge>
        </div>
      </div>

      <Tabs defaultValue="configuration" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="configuration">Configuration</TabsTrigger>
          <TabsTrigger value="integrations">Integrations</TabsTrigger>
          <TabsTrigger value="monitoring">Monitoring</TabsTrigger>
        </TabsList>

        <TabsContent value="configuration" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                ServiceNow Configuration
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField
                      control={form.control}
                      name="instance"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>ServiceNow Instance</FormLabel>
                          <FormControl>
                            <Input placeholder="dev12345" {...field} />
                          </FormControl>
                          <FormDescription>
                            Your ServiceNow instance name (without .service-now.com)
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="username"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Username</FormLabel>
                          <FormControl>
                            <Input placeholder="username" {...field} />
                          </FormControl>
                          <FormDescription>
                            ServiceNow username or service account
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="assignmentGroup"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Assignment Group</FormLabel>
                          <FormControl>
                            <Input placeholder="IT Support" {...field} />
                          </FormControl>
                          <FormDescription>
                            Default assignment group for created incidents
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="callerId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Caller ID</FormLabel>
                          <FormControl>
                            <Input placeholder="system.admin" {...field} />
                          </FormControl>
                          <FormDescription>
                            Default caller ID for created incidents
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <Separator />

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField
                      control={form.control}
                      name="syncInterval"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Sync Interval (seconds)</FormLabel>
                          <FormControl>
                            <Input 
                              type="number" 
                              min="60" 
                              {...field}
                              onChange={(e) => field.onChange(parseInt(e.target.value))}
                            />
                          </FormControl>
                          <FormDescription>
                            How often to sync with ServiceNow (minimum 60 seconds)
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="pollInterval"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Poll Interval (seconds)</FormLabel>
                          <FormControl>
                            <Input 
                              type="number" 
                              min="30" 
                              {...field}
                              onChange={(e) => field.onChange(parseInt(e.target.value))}
                            />
                          </FormControl>
                          <FormDescription>
                            How often to poll for new incidents (minimum 30 seconds)
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="flex items-center space-x-6">
                    <FormField
                      control={form.control}
                      name="autoSync"
                      render={({ field }) => (
                        <FormItem className="flex items-center space-x-2">
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                          <FormLabel>Auto Sync</FormLabel>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="isActive"
                      render={({ field }) => (
                        <FormItem className="flex items-center space-x-2">
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                          <FormLabel>Active</FormLabel>
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="flex gap-3">
                    <Button type="submit" disabled={saveConfigMutation.isPending}>
                      {saveConfigMutation.isPending ? "Saving..." : "Save Configuration"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleTestConnection}
                      disabled={testingConnection}
                    >
                      <Shield className="h-4 w-4 mr-2" />
                      {testingConnection ? "Testing..." : "Test Connection"}
                    </Button>
                  </div>

                  {connectionStatus !== 'idle' && (
                    <Alert className={connectionStatus === 'success' ? 'border-green-500' : 'border-red-500'}>
                      {connectionStatus === 'success' ? (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-500" />
                      )}
                      <AlertDescription>
                        {connectionStatus === 'success' 
                          ? "Connection to ServiceNow is working properly."
                          : "Connection to ServiceNow failed. Please check your credentials and instance."
                        }
                      </AlertDescription>
                    </Alert>
                  )}
                </form>
              </Form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="integrations" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                ServiceNow Integrations
              </CardTitle>
            </CardHeader>
            <CardContent>
              {integrationsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                </div>
              ) : integrations?.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No ServiceNow integrations found.
                </div>
              ) : (
                <div className="space-y-4">
                  {integrations?.map((integration: any) => (
                    <div key={integration.id} className="border rounded-lg p-4">
                      <div className="flex items-start justify-between">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">{integration.serviceNowNumber}</Badge>
                            <Badge variant={integration.syncStatus === 'SYNCED' ? 'default' : 'secondary'}>
                              {integration.syncStatus}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            Priority: {integration.priority} | Urgency: {integration.urgency}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            Last sync: {integration.lastSyncAt ? new Date(integration.lastSyncAt).toLocaleString() : 'Never'}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => window.open(integration.metadata?.serviceNowUrl, '_blank')}
                          >
                            View in ServiceNow
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="monitoring" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Polling Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              {lastPollResults ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="p-4 border rounded-lg">
                      <div className="text-2xl font-bold text-blue-600">
                        {lastPollResults.totalPolled}
                      </div>
                      <div className="text-sm text-muted-foreground">Total Polled</div>
                    </div>
                    <div className="p-4 border rounded-lg">
                      <div className="text-2xl font-bold text-green-600">
                        {lastPollResults.newIncidents}
                      </div>
                      <div className="text-sm text-muted-foreground">New Incidents</div>
                    </div>
                    <div className="p-4 border rounded-lg">
                      <div className="text-2xl font-bold text-orange-600">
                        {lastPollResults.incidents?.length || 0}
                      </div>
                      <div className="text-sm text-muted-foreground">Processed</div>
                    </div>
                  </div>
                  
                  {lastPollResults.newIncidents > 0 && (
                    <Alert>
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription>
                        {lastPollResults.newIncidents} new incidents have been imported from ServiceNow and are now available in the Active Alerts.
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No polling results yet. Click "Poll Incidents" to start.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}