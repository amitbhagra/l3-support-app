import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Sidebar from "@/components/dashboard/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Code, FileText, Calendar, Download, Eye, AlertTriangle, GitBranch } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

interface ModifiedFile {
  name: string;
  path: string;
  size: number;
  modified: string;
  incident?: {
    id: string;
    title: string;
    severity: string;
  };
  originalPath?: string;
  changesCount?: number;
}

interface FileContent {
  filename: string;
  content: string;
}

export default function ModifiedFilesPage() {
  const [selectedFile, setSelectedFile] = useState<ModifiedFile | null>(null);
  const [isViewerOpen, setIsViewerOpen] = useState(false);

  const { data: files, isLoading } = useQuery<ModifiedFile[]>({
    queryKey: ['/api/modified-files'],
  });

  const { data: fileContent, isLoading: isLoadingContent } = useQuery<FileContent>({
    queryKey: [`/api/modified-files/${selectedFile?.name}`],
    enabled: !!selectedFile,
  });

  const handleViewFile = (file: ModifiedFile) => {
    setSelectedFile(file);
    setIsViewerOpen(true);
  };

  const handleDownloadFile = (file: ModifiedFile) => {
    const link = document.createElement('a');
    link.href = `/api/modified-files/${file.name}`;
    link.download = file.name;
    link.click();
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      
      <div className="flex-1 overflow-auto">
        <header className="bg-surface border-b border-border p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Code className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">Modified Files</h1>
                <p className="text-muted-foreground">
                  View and download files modified by approved code changes
                </p>
              </div>
            </div>
            <Badge variant="outline" className="text-sm">
              {files?.length || 0} file{files?.length !== 1 ? 's' : ''}
            </Badge>
          </div>
        </header>

        <main className="p-6">
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-center">
                <Code className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">Loading modified files...</p>
              </div>
            </div>
          ) : !files || files.length === 0 ? (
            <Card>
              <CardContent className="py-12">
                <div className="text-center">
                  <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium mb-2">No Modified Files Yet</h3>
                  <p className="text-muted-foreground">
                    Modified files will appear here when you approve code changes in the Actions tab
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {files.map((file) => (
                <Card key={file.name} className="border border-border">
                  <CardHeader className="pb-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center">
                          <FileText className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div>
                          <CardTitle className="text-lg">{file.name}</CardTitle>
                          <p className="text-sm text-muted-foreground">
                            {formatFileSize(file.size)} • Modified {formatDistanceToNow(new Date(file.modified))} ago
                          </p>
                          {file.incident && (
                            <div className="flex items-center space-x-2 mt-2">
                              <Badge 
                                variant="outline" 
                                className={`text-xs ${
                                  file.incident.severity === 'CRITICAL' ? 'border-red-200 bg-red-50 text-red-700' :
                                  file.incident.severity === 'HIGH' ? 'border-orange-200 bg-orange-50 text-orange-700' :
                                  file.incident.severity === 'MEDIUM' ? 'border-yellow-200 bg-yellow-50 text-yellow-700' :
                                  'border-green-200 bg-green-50 text-green-700'
                                }`}
                              >
                                {file.incident.severity}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                {file.incident.id}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleViewFile(file)}
                          className="flex items-center space-x-1"
                        >
                          <Eye className="h-4 w-4" />
                          <span>View</span>
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDownloadFile(file)}
                          className="flex items-center space-x-1"
                        >
                          <Download className="h-4 w-4" />
                          <span>Download</span>
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  
                  <CardContent>
                    {file.incident && (
                      <div className="bg-muted/50 p-3 rounded-lg mb-3">
                        <div className="flex items-center space-x-2 mb-1">
                          <AlertTriangle className="h-4 w-4 text-orange-500" />
                          <span className="font-medium text-sm">Incident: {file.incident.id}</span>
                        </div>
                        <p className="text-sm text-muted-foreground">{file.incident.title}</p>
                      </div>
                    )}
                    <div className="flex items-center space-x-4 text-xs text-muted-foreground">
                      <span className="flex items-center">
                        <Calendar className="h-3 w-3 mr-1" />
                        {new Date(file.modified).toLocaleString()}
                      </span>
                      <span className="flex items-center">
                        <FileText className="h-3 w-3 mr-1" />
                        {file.originalPath || file.path}
                      </span>
                      {file.changesCount && (
                        <span className="flex items-center">
                          <GitBranch className="h-3 w-3 mr-1" />
                          {file.changesCount} change{file.changesCount !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </main>
      </div>

      {/* File Viewer Dialog */}
      <Dialog open={isViewerOpen} onOpenChange={setIsViewerOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh]" aria-describedby="file-content-description">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2">
              <FileText className="h-5 w-5" />
              <span>{selectedFile?.name}</span>
            </DialogTitle>
            <DialogDescription id="file-content-description">
              View the contents of the modified file from the incident resolution process.
            </DialogDescription>
          </DialogHeader>
          
          <div className="mt-4">
            {isLoadingContent ? (
              <div className="flex items-center justify-center h-64">
                <p className="text-muted-foreground">Loading file content...</p>
              </div>
            ) : fileContent ? (
              <div className="space-y-4">
                <div className="bg-muted/50 p-4 rounded-lg">
                  <pre className="text-sm whitespace-pre-wrap overflow-auto max-h-96">
                    <code>{fileContent.content}</code>
                  </pre>
                </div>
                
                <div className="flex items-center justify-end space-x-2">
                  <Button
                    variant="outline"
                    onClick={() => selectedFile && handleDownloadFile(selectedFile)}
                    className="flex items-center space-x-1"
                  >
                    <Download className="h-4 w-4" />
                    <span>Download</span>
                  </Button>
                  <Button
                    onClick={() => setIsViewerOpen(false)}
                  >
                    Close
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground">Failed to load file content</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}