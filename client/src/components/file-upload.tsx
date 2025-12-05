import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Upload, FileText, AlertCircle, Bug } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

export default function FileUpload() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [issueSummary, setIssueSummary] = useState<string>('');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const uploadMutation = useMutation({
    mutationFn: async ({ file, summary }: { file: File; summary: string }) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('issueSummary', summary);
      
      const response = await fetch('/api/upload-incident-log', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      
      if (!response.ok) {
        throw new Error('Failed to upload incident log');
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Incident Log Uploaded Successfully",
        description: `Created incident "${data.incident.title}". RCA analysis in progress.`
      });
      
      // Invalidate all related queries to refresh the dashboard
      queryClient.invalidateQueries({ queryKey: ['/api/active-alerts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/rca-workflows'] });
      queryClient.invalidateQueries({ queryKey: ['/api/actions/recent'] });
      queryClient.invalidateQueries({ queryKey: ['/api/knowledge-base'] });
      
      setSelectedFile(null);
      setIssueSummary('');
    },
    onError: (error: any) => {
      toast({
        title: "Upload Failed",
        description: error.message || "Failed to upload and process the file.",
        variant: "destructive"
      });
    }
  });

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleUpload = () => {
    if (selectedFile && issueSummary.trim()) {
      uploadMutation.mutate({ file: selectedFile, summary: issueSummary.trim() });
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bug className="h-5 w-5" />
          Report New Incident
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="issue-summary">Issue Summary</Label>
            <Textarea
              id="issue-summary"
              placeholder="Describe the issue you're experiencing (e.g., 'Database connection timeouts during peak hours')"
              value={issueSummary}
              onChange={(e) => setIssueSummary(e.target.value)}
              className="min-h-[100px]"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="log-file">Log File</Label>
            <Input
              id="log-file"
              type="file"
              accept=".txt,.log,.json"
              onChange={handleFileSelect}
              className="cursor-pointer"
            />
            {selectedFile && (
              <p className="text-sm text-muted-foreground">
                Selected: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
              </p>
            )}
          </div>
        </div>
        
        <Button
          onClick={handleUpload}
          disabled={!selectedFile || !issueSummary.trim() || uploadMutation.isPending}
          className="w-full"
        >
          {uploadMutation.isPending ? (
            <>
              <Upload className="mr-2 h-4 w-4 animate-spin" />
              Analyzing Logs & Creating Incident...
            </>
          ) : (
            <>
              <Upload className="mr-2 h-4 w-4" />
              Create Incident & Start RCA Analysis
            </>
          )}
        </Button>

        {uploadMutation.isError && (
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" />
            Failed to upload incident log. Please try again.
          </div>
        )}
        
        <div className="text-xs text-muted-foreground space-y-1">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
            <div>
              Provide a summary of your issue and upload the related log file. The AI will analyze the logs, determine the root cause, and automatically create RCA workflows, actions, and knowledge base entries.
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}