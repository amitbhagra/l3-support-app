import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import ErrorBoundary from "@/components/ErrorBoundary";
import Dashboard from "@/pages/dashboard";
import Alerts from "@/pages/alerts";
import RcaEngine from "@/pages/rca";
import Actions from "@/pages/actions";
import Knowledge from "@/pages/knowledge";
import Documents from "@/pages/documents";
import ModifiedFiles from "@/pages/modified-files";
import Escalations from "@/pages/escalations";
import JiraConfig from "@/pages/jira-config";
import ServiceNow from "@/pages/servicenow";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/alerts" component={Alerts} />
      <Route path="/rca" component={RcaEngine} />
      <Route path="/actions" component={Actions} />
      <Route path="/knowledge" component={Knowledge} />
      <Route path="/documents" component={Documents} />
      <Route path="/modified-files" component={ModifiedFiles} />
      <Route path="/escalations" component={Escalations} />
      <Route path="/jira" component={JiraConfig} />
      <Route path="/servicenow" component={ServiceNow} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
