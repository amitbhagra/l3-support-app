import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, FileText, ExternalLink, Trash2, Edit, Download, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { Document, CodeRepository } from "@shared/schema";

export default function Documents() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showRepositoryDialog, setShowRepositoryDialog] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Clear documents mutation
  const clearDocumentsMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('DELETE', '/api/documents/clear');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/documents'] });
      toast({
        title: "Documents cleared",
        description: "All documents have been removed from the knowledge base.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error clearing documents",
        description: error instanceof Error ? error.message : "Failed to clear documents",
        variant: "destructive",
      });
    },
  });

  // Clear repositories mutation
  const clearRepositoriesMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('DELETE', '/api/repositories/clear');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/repositories'] });
      toast({
        title: "Repositories cleared",
        description: "All repositories have been disconnected.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error clearing repositories",
        description: error instanceof Error ? error.message : "Failed to clear repositories",
        variant: "destructive",
      });
    },
  });

  // Fetch documents
  const { data: documents = [], isLoading: documentsLoading } = useQuery({
    queryKey: ['/api/documents'],
    enabled: true,
  });

  // Fetch code repositories
  const { data: repositories = [], isLoading: repositoriesLoading } = useQuery({
    queryKey: ['/api/repositories'],
    enabled: true,
  });

  // Fetch GitHub integration status
  const { data: githubStatus } = useQuery({
    queryKey: ['/api/github/status'],
  });

  // Create document mutation
  const createDocumentMutation = useMutation({
    mutationFn: async (documentData: any) => {
      const response = await apiRequest('POST', '/api/documents', documentData);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/documents'] });
      setShowCreateDialog(false);
      setDocumentForm({ title: '', content: '', type: '', version: '1.0.0' });
      toast({
        title: "Document created",
        description: "The document has been added to the knowledge base.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error creating document",
        description: error instanceof Error ? error.message : "Failed to create document",
        variant: "destructive",
      });
    },
  });

  // Create repository mutation
  const createRepositoryMutation = useMutation({
    mutationFn: async (repositoryData: any) => {
      const response = await apiRequest('POST', '/api/repositories', repositoryData);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/repositories'] });
      setShowRepositoryDialog(false);
      setRepositoryForm({ name: '', url: '', branch: 'main', type: '' });
      toast({
        title: "Repository added",
        description: "The code repository has been connected for analysis.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error adding repository",
        description: error instanceof Error ? error.message : "Failed to add repository",
        variant: "destructive",
      });
    },
  });

  // Repository sync mutation
  const syncRepositoryMutation = useMutation({
    mutationFn: async (repositoryId: number) => {
      const response = await apiRequest('POST', `/api/repositories/${repositoryId}/sync`);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || data.details || 'Sync failed');
      }
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/repositories'] });
      toast({
        title: "Repository synced successfully",
        description: "The repository content has been synchronized and is ready for AI analysis.",
      });
    },
    onError: (error: any) => {
      const errorMessage = error.message || error.error || "Failed to sync repository";
      console.error('Sync error:', error);
      toast({
        title: "Repository sync failed",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  // Delete repository mutation
  const deleteRepositoryMutation = useMutation({
    mutationFn: async (repositoryId: number) => {
      const response = await apiRequest('DELETE', `/api/repositories/${repositoryId}`);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete repository');
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/repositories'] });
      queryClient.invalidateQueries({ queryKey: ['/api/documents'] });
      toast({
        title: "Repository deleted successfully",
        description: "The repository and all associated documents have been removed.",
      });
    },
    onError: (error: any) => {
      const errorMessage = error.message || error.error || "Failed to delete repository";
      console.error('Delete error:', error);
      toast({
        title: "Repository deletion failed",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  // Delete document mutation
  const deleteDocumentMutation = useMutation({
    mutationFn: async (documentId: number) => {
      const response = await apiRequest('DELETE', `/api/documents/${documentId}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/documents'] });
      toast({
        title: "Document deleted",
        description: "The document has been removed from the knowledge base.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error deleting document",
        description: error instanceof Error ? error.message : "Failed to delete document",
        variant: "destructive",
      });
    },
  });

  // Filter documents based on search query
  const filteredDocuments = documents.filter((doc: Document) =>
    doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    doc.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
    doc.type.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const [documentForm, setDocumentForm] = useState({
    title: '',
    content: '',
    type: '',
    version: '1.0.0',
  });

  const handleCreateDocument = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    
    const documentData = {
      title: documentForm.title,
      content: documentForm.content,
      type: documentForm.type,
      version: documentForm.version,
      isActive: true,
    };

    createDocumentMutation.mutate(documentData);
  };

  const [repositoryForm, setRepositoryForm] = useState({
    name: '',
    url: '',
    branch: 'main',
    type: '',
  });

  const handleCreateRepository = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    
    const repositoryData = {
      name: repositoryForm.name,
      url: repositoryForm.url,
      branch: repositoryForm.branch,
      type: repositoryForm.type,
      isActive: true,
    };

    createRepositoryMutation.mutate(repositoryData);
  };

  const handleDeleteDocument = (documentId: number) => {
    if (confirm('Are you sure you want to delete this document? This action cannot be undone.')) {
      deleteDocumentMutation.mutate(documentId);
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'documentation': return 'bg-blue-500';
      case 'runbook': return 'bg-green-500';
      case 'troubleshooting': return 'bg-yellow-500';
      case 'configuration': return 'bg-purple-500';
      case 'script': return 'bg-orange-500';
      default: return 'bg-gray-500';
    }
  };

  if (documentsLoading || repositoriesLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center min-h-96">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Document Management</h1>
          <p className="text-gray-600 mt-2">Manage knowledge base documents and code repositories for enhanced AI analysis</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => {
              if (confirm('Are you sure you want to clear all documents? This cannot be undone.')) {
                clearDocumentsMutation.mutate();
              }
            }}
            disabled={clearDocumentsMutation.isPending}
          >
            <Trash2 className="w-4 h-4 mr-2" />
            {clearDocumentsMutation.isPending ? 'Clearing...' : 'Clear All'}
          </Button>
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Add Document
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Create New Document</DialogTitle>
                <DialogDescription>
                  Add a new document to the knowledge base for enhanced AI analysis and troubleshooting.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreateDocument} className="space-y-4">
                <div>
                  <Label htmlFor="title">Title</Label>
                  <Input
                    id="title"
                    value={documentForm.title}
                    onChange={(e) => setDocumentForm({...documentForm, title: e.target.value})}
                    placeholder="Enter document title"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="type">Type</Label>
                  <Select value={documentForm.type} onValueChange={(value) => setDocumentForm({...documentForm, type: value})}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select document type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="documentation">Documentation</SelectItem>
                      <SelectItem value="runbook">Runbook</SelectItem>
                      <SelectItem value="troubleshooting">Troubleshooting Guide</SelectItem>
                      <SelectItem value="configuration">Configuration</SelectItem>
                      <SelectItem value="script">Script</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="version">Version</Label>
                  <Input
                    id="version"
                    value={documentForm.version}
                    onChange={(e) => setDocumentForm({...documentForm, version: e.target.value})}
                    placeholder="e.g., 1.0.0"
                  />
                </div>
                <div>
                  <Label htmlFor="content">Content</Label>
                  <Textarea
                    id="content"
                    value={documentForm.content}
                    onChange={(e) => setDocumentForm({...documentForm, content: e.target.value})}
                    placeholder="Enter document content"
                    className="min-h-32"
                    required
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => {
                    setShowCreateDialog(false);
                    setDocumentForm({ title: '', content: '', type: '', version: '1.0.0' });
                  }}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createDocumentMutation.isPending}>
                    {createDocumentMutation.isPending ? 'Creating...' : 'Create Document'}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>

          <Dialog open={showRepositoryDialog} onOpenChange={setShowRepositoryDialog}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <ExternalLink className="w-4 h-4 mr-2" />
                Connect Repository
              </Button>
            </DialogTrigger>
            <DialogContent aria-describedby="repository-dialog-description">
              <DialogHeader>
                <DialogTitle>Connect Code Repository</DialogTitle>
                <DialogDescription id="repository-dialog-description">
                  Connect a code repository to provide context for AI-powered troubleshooting and analysis.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreateRepository} className="space-y-4">
                <div>
                  <Label htmlFor="name">Repository Name</Label>
                  <Input
                    id="name"
                    value={repositoryForm.name}
                    onChange={(e) => setRepositoryForm({...repositoryForm, name: e.target.value})}
                    placeholder="Enter repository name"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="url">Repository URL</Label>
                  <Input
                    id="url"
                    value={repositoryForm.url}
                    onChange={(e) => setRepositoryForm({...repositoryForm, url: e.target.value})}
                    placeholder="https://github.com/user/repo"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="branch">Branch</Label>
                  <Input
                    id="branch"
                    value={repositoryForm.branch}
                    onChange={(e) => setRepositoryForm({...repositoryForm, branch: e.target.value})}
                    placeholder="main"
                  />
                </div>
                <div>
                  <Label htmlFor="type">Repository Type</Label>
                  <Select value={repositoryForm.type} onValueChange={(value) => setRepositoryForm({...repositoryForm, type: value})}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select repository type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="github">GitHub</SelectItem>
                      <SelectItem value="gitlab">GitLab</SelectItem>
                      <SelectItem value="bitbucket">Bitbucket</SelectItem>
                      <SelectItem value="git">Generic Git</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => {
                    setShowRepositoryDialog(false);
                    setRepositoryForm({ name: '', url: '', branch: 'main', type: '' });
                  }}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createRepositoryMutation.isPending}>
                    {createRepositoryMutation.isPending ? 'Connecting...' : 'Connect Repository'}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Search */}
      <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search documents by title, content, or type..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Documents</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{documents.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Connected Repositories</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{repositories.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Active Documents</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{documents.filter((doc: Document) => doc.isActive).length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Documents Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {filteredDocuments.map((document: Document) => (
          <Card key={document.id} className="hover:shadow-lg transition-shadow">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-blue-500" />
                  <div>
                    <CardTitle className="text-lg">{document.title}</CardTitle>
                    <p className="text-sm text-gray-600">v{document.version}</p>
                  </div>
                </div>
                <Badge className={`${getTypeColor(document.type)} text-white`}>
                  {document.type}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600 mb-3 line-clamp-3 min-h-12">
                {document.content.substring(0, 150)}...
              </p>
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>Updated: {new Date(document.lastUpdated).toLocaleDateString()}</span>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0">
                    <Edit className="w-3 h-3" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0">
                    <Download className="w-3 h-3" />
                  </Button>
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    className="h-7 w-7 p-0 text-red-500"
                    onClick={() => handleDeleteDocument(document.id)}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Code Repositories */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Connected Code Repositories</h2>
          <div className="flex items-center gap-4">
            {githubStatus && (
              <div className="flex items-center gap-2 text-sm">
                <div className={`h-2 w-2 rounded-full ${githubStatus.available ? 'bg-green-500' : 'bg-red-500'}`} />
                <span className={githubStatus.available ? 'text-green-700' : 'text-red-700'}>
                  {githubStatus.available 
                    ? `GitHub Integration Active (${githubStatus.repositoriesConnected || 0} repos)`
                    : githubStatus.message || 'GitHub Integration Disabled'
                  }
                </span>
              </div>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (confirm('Are you sure you want to clear all repositories? This cannot be undone.')) {
                  clearRepositoriesMutation.mutate();
                }
              }}
              disabled={clearRepositoriesMutation.isPending}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              {clearRepositoriesMutation.isPending ? 'Clearing...' : 'Clear All'}
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {repositories.map((repository: CodeRepository) => (
            <Card key={repository.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ExternalLink className="w-5 h-5 text-green-500" />
                    <div>
                      <CardTitle className="text-lg">{repository.name}</CardTitle>
                      <p className="text-sm text-gray-600">{repository.type}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => syncRepositoryMutation.mutate(repository.id)}
                      disabled={syncRepositoryMutation.isPending}
                      className="min-w-16"
                    >
                      {syncRepositoryMutation.isPending ? 'Syncing...' : 'Sync'}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        if (confirm(`Are you sure you want to delete "${repository.name}"? This will remove the repository and all associated documents. This action cannot be undone.`)) {
                          deleteRepositoryMutation.mutate(repository.id);
                        }
                      }}
                      disabled={deleteRepositoryMutation.isPending}
                      className="min-w-16 text-red-500 hover:text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
                  <span>Branch: {repository.branch}</span>
                  <span>•</span>
                  <span>Last synced: {repository.lastSyncAt ? new Date(repository.lastSyncAt).toLocaleDateString() : 'Never'}</span>
                </div>
                {repository.syncStatus && (
                  <div className="flex items-center gap-2 text-xs mb-2">
                    <div className={`h-2 w-2 rounded-full ${
                      repository.syncStatus === 'SUCCESS' ? 'bg-green-500' :
                      repository.syncStatus === 'SYNCING' ? 'bg-yellow-500' :
                      repository.syncStatus === 'FAILED' ? 'bg-red-500' :
                      'bg-gray-400'
                    }`} />
                    <span className={`${
                      repository.syncStatus === 'SUCCESS' ? 'text-green-700' :
                      repository.syncStatus === 'SYNCING' ? 'text-yellow-700' :
                      repository.syncStatus === 'FAILED' ? 'text-red-700' :
                      'text-gray-600'
                    }`}>
                      {repository.syncStatus === 'SUCCESS' ? 'Synchronized' :
                       repository.syncStatus === 'SYNCING' ? 'Syncing...' :
                       repository.syncStatus === 'FAILED' ? 'Sync Failed' :
                       'Not Synced'}
                    </span>
                  </div>
                )}
                <div className="mt-2 flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      try {
                        if (repository.url) {
                          window.open(repository.url, '_blank', 'noopener,noreferrer');
                        } else {
                          console.error('Repository URL is missing');
                        }
                      } catch (error) {
                        console.error('Error opening repository:', error);
                        // Fallback: try to navigate in same tab
                        window.location.href = repository.url;
                      }
                    }}
                    className="text-xs"
                  >
                    <ExternalLink className="w-3 h-3 mr-1" />
                    View Repository
                  </Button>
                  <a 
                    href={repository.url} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="text-xs text-blue-500 hover:underline"
                  >
                    {repository.url}
                  </a>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {filteredDocuments.length === 0 && searchQuery && (
        <div className="text-center py-8">
          <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500">No documents found matching your search.</p>
        </div>
      )}
    </div>
  );
}