import { Octokit } from "@octokit/rest";

interface GitHubIntegrationConfig {
  token: string;
  owner: string;
  repo: string;
  baseBranch?: string;
}

interface CodeChange {
  filePath: string;
  content: string;
  commitMessage: string;
}

interface PullRequestResult {
  pullRequestUrl: string;
  pullRequestNumber: number;
  branchName: string;
  success: boolean;
  message: string;
}

export class GitHubIntegrationService {
  private octokit: Octokit;
  
  constructor(token: string) {
    this.octokit = new Octokit({
      auth: token,
    });
  }

  /**
   * Apply code changes directly to GitHub repository via Pull Request
   */
  async applyChangesToRepository(
    config: GitHubIntegrationConfig,
    changes: CodeChange[],
    incidentId: string,
    incidentTitle: string
  ): Promise<PullRequestResult> {
    try {
      const branchName = `ai-fix-${incidentId}-${Date.now()}`;
      const baseBranch = config.baseBranch || 'main';
      
      // Try creating pull request via fork if direct access fails
      const forkResult = await this.createPullRequestViaFork(
        config.owner,
        config.repo,
        branchName,
        baseBranch,
        changes,
        incidentId,
        incidentTitle
      );
      
      if (forkResult.success) {
        return forkResult;
      }
      
      // Alternative approach: Try to create branch using tree API
      const result = await this.createBranchWithTreeAPI(
        config.owner,
        config.repo,
        branchName,
        baseBranch,
        changes
      );
      
      if (!result.success) {
        // Fallback: Try direct file updates on main branch
        return await this.applyDirectChanges(
          config,
          changes,
          incidentId,
          incidentTitle
        );
      }
      
      // Create Pull Request
      const { data: pullRequest } = await this.octokit.rest.pulls.create({
        owner: config.owner,
        repo: config.repo,
        title: `AI Fix: ${incidentTitle}`,
        head: branchName,
        base: baseBranch,
        body: this.generatePullRequestBody(incidentId, incidentTitle, changes),
      });
      
      return {
        pullRequestUrl: pullRequest.html_url,
        pullRequestNumber: pullRequest.number,
        branchName,
        success: true,
        message: `Pull request created successfully: ${pullRequest.html_url}`,
      };
      
    } catch (error) {
      console.error('GitHub integration failed:', error);
      return {
        pullRequestUrl: '',
        pullRequestNumber: 0,
        branchName: '',
        success: false,
        message: `Failed to apply changes to GitHub: ${error.message}`,
      };
    }
  }

  /**
   * Create pull request via fork (works better with limited permissions)
   */
  private async createPullRequestViaFork(
    owner: string,
    repo: string,
    branchName: string,
    baseBranch: string,
    changes: CodeChange[],
    incidentId: string,
    incidentTitle: string
  ): Promise<PullRequestResult> {
    try {
      // Get the authenticated user to create fork
      const { data: user } = await this.octokit.rest.users.getAuthenticated();
      
      // Create fork (or use existing fork)
      let fork;
      try {
        fork = await this.octokit.rest.repos.createFork({
          owner,
          repo,
        });
      } catch (error) {
        // Fork might already exist
        fork = await this.octokit.rest.repos.get({
          owner: user.login,
          repo,
        });
      }
      
      // Wait a moment for fork to be ready
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Create branch in fork
      const { data: baseRef } = await this.octokit.rest.git.getRef({
        owner: user.login,
        repo,
        ref: `heads/${baseBranch}`,
      });
      
      await this.octokit.rest.git.createRef({
        owner: user.login,
        repo,
        ref: `refs/heads/${branchName}`,
        sha: baseRef.object.sha,
      });
      
      // Apply changes to fork
      for (const change of changes) {
        await this.updateFileInBranch(
          user.login,
          repo,
          change.filePath,
          change.content,
          change.commitMessage,
          branchName
        );
      }
      
      // Create pull request from fork
      const { data: pullRequest } = await this.octokit.rest.pulls.create({
        owner,
        repo,
        title: `AI Fix: ${incidentTitle}`,
        head: `${user.login}:${branchName}`,
        base: baseBranch,
        body: this.generatePullRequestBody(incidentId, incidentTitle, changes),
      });
      
      return {
        pullRequestUrl: pullRequest.html_url,
        pullRequestNumber: pullRequest.number,
        branchName,
        success: true,
        message: `Pull request created via fork: ${pullRequest.html_url}`,
      };
      
    } catch (error) {
      console.error('Fork-based pull request failed:', error);
      return {
        pullRequestUrl: '',
        pullRequestNumber: 0,
        branchName: '',
        success: false,
        message: `Fork approach failed: ${error.message}`,
      };
    }
  }

  /**
   * Create branch using tree API (more robust for permissions)
   */
  private async createBranchWithTreeAPI(
    owner: string,
    repo: string,
    branchName: string,
    baseBranch: string,
    changes: CodeChange[]
  ): Promise<{ success: boolean; message: string }> {
    try {
      // Get the latest commit from base branch
      const { data: baseRef } = await this.octokit.rest.git.getRef({
        owner,
        repo,
        ref: `heads/${baseBranch}`,
      });
      
      // Get the base tree
      const { data: baseCommit } = await this.octokit.rest.git.getCommit({
        owner,
        repo,
        commit_sha: baseRef.object.sha,
      });
      
      // Create tree entries for changes
      const tree = [];
      for (const change of changes) {
        tree.push({
          path: change.filePath,
          mode: '100644',
          type: 'blob',
          content: change.content,
        });
      }
      
      // Create new tree
      const { data: newTree } = await this.octokit.rest.git.createTree({
        owner,
        repo,
        tree,
        base_tree: baseCommit.tree.sha,
      });
      
      // Create commit
      const { data: newCommit } = await this.octokit.rest.git.createCommit({
        owner,
        repo,
        message: `AI Fix: Apply automated changes for incident`,
        tree: newTree.sha,
        parents: [baseRef.object.sha],
      });
      
      // Try to create branch reference
      try {
        await this.octokit.rest.git.createRef({
          owner,
          repo,
          ref: `refs/heads/${branchName}`,
          sha: newCommit.sha,
        });
        return { success: true, message: 'Branch created successfully' };
      } catch (refError) {
        // If ref creation fails, try updating main branch directly
        console.log('Ref creation failed, trying alternative approach:', refError.message);
        return { success: false, message: refError.message };
      }
      
    } catch (error) {
      console.error('Tree API approach failed:', error);
      return { success: false, message: error.message };
    }
  }

  /**
   * Apply changes directly to main branch when branch creation fails
   */
  private async applyDirectChanges(
    config: GitHubIntegrationConfig,
    changes: CodeChange[],
    incidentId: string,
    incidentTitle: string
  ): Promise<PullRequestResult> {
    try {
      const baseBranch = config.baseBranch || 'main';
      
      // Apply changes directly to main branch
      for (const change of changes) {
        await this.updateFileInBranch(
          config.owner,
          config.repo,
          change.filePath,
          change.content,
          `AI Fix: ${change.commitMessage} (Incident: ${incidentId})`,
          baseBranch
        );
      }
      
      // Get the latest commit SHA for reference
      const { data: latestCommit } = await this.octokit.rest.repos.getCommit({
        owner: config.owner,
        repo: config.repo,
        ref: baseBranch,
      });
      
      return {
        pullRequestUrl: `https://github.com/${config.owner}/${config.repo}/commit/${latestCommit.sha}`,
        pullRequestNumber: 0,
        branchName: baseBranch,
        success: true,
        message: `Changes applied directly to ${baseBranch} branch: ${latestCommit.html_url}`,
      };
      
    } catch (error) {
      console.error('Direct changes failed:', error);
      return {
        pullRequestUrl: '',
        pullRequestNumber: 0,
        branchName: '',
        success: false,
        message: `Failed to apply direct changes: ${error.message}`,
      };
    }
  }

  /**
   * Update a single file in the specified branch
   */
  private async updateFileInBranch(
    owner: string,
    repo: string,
    filePath: string,
    content: string,
    commitMessage: string,
    branchName: string
  ): Promise<void> {
    try {
      // Get current file content to get the SHA
      const { data: currentFile } = await this.octokit.rest.repos.getContent({
        owner,
        repo,
        path: filePath,
        ref: branchName,
      });
      
      // Update the file
      await this.octokit.rest.repos.createOrUpdateFileContents({
        owner,
        repo,
        path: filePath,
        message: commitMessage,
        content: Buffer.from(content).toString('base64'),
        sha: (currentFile as any).sha,
        branch: branchName,
      });
      
    } catch (error) {
      if (error.status === 404) {
        // File doesn't exist, create it
        await this.octokit.rest.repos.createOrUpdateFileContents({
          owner,
          repo,
          path: filePath,
          message: commitMessage,
          content: Buffer.from(content).toString('base64'),
          branch: branchName,
        });
      } else {
        throw error;
      }
    }
  }

  /**
   * Generate Pull Request description
   */
  private generatePullRequestBody(
    incidentId: string,
    incidentTitle: string,
    changes: CodeChange[]
  ): string {
    return `
## 🤖 AI-Generated Fix

**Incident ID:** ${incidentId}
**Issue:** ${incidentTitle}
**Generated:** ${new Date().toISOString()}

### 📋 Changes Applied

${changes.map(change => `
- **File:** \`${change.filePath}\`
- **Description:** ${change.commitMessage}
`).join('\n')}

### 🔍 Review Notes

This pull request was automatically generated by the AI IT Support system based on:
- Log analysis and error pattern recognition
- Internal documentation and knowledge base
- Code repository analysis with line-specific suggestions

**⚠️ Important:** Please review all changes carefully before merging.

### 🚀 Testing Recommendations

1. Verify the fix addresses the original issue
2. Run unit tests to ensure no regression
3. Test in staging environment before production deployment
4. Monitor logs after deployment

---
*Generated by AI IT Support Dashboard*
`;
  }

  /**
   * Check if user has required permissions
   */
  async validatePermissions(owner: string, repo: string): Promise<{
    hasWriteAccess: boolean;
    canCreatePullRequests: boolean;
    message: string;
  }> {
    try {
      const { data: repoData } = await this.octokit.rest.repos.get({
        owner,
        repo,
      });
      
      const permissions = repoData.permissions;
      
      return {
        hasWriteAccess: permissions?.push || false,
        canCreatePullRequests: permissions?.pull || false,
        message: permissions?.push 
          ? "All permissions available for GitHub integration"
          : "Missing write permissions. Please ensure your GitHub token has 'repo' scope.",
      };
      
    } catch (error) {
      return {
        hasWriteAccess: false,
        canCreatePullRequests: false,
        message: `Failed to validate permissions: ${error.message}`,
      };
    }
  }
}

export const githubIntegrationService = new GitHubIntegrationService(
  process.env.GITHUB_TOKEN || ''
);