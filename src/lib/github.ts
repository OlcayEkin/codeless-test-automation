/**
 * Talks to the GitHub REST API with a user's access token.
 * GITHUB_API_URL can point elsewhere, for GitHub Enterprise or for tests.
 */

const apiBase = () => (process.env.GITHUB_API_URL || "https://api.github.com").replace(/\/$/, "");

export type ConnectionResult = { ok: true; message: string } | { ok: false; message: string };
type Target = { repository: string; workflowFile: string; branch: string; token: string };

async function get(path: string, token: string) {
  return fetch(`${apiBase()}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "codeless-test-automation",
    },
    signal: AbortSignal.timeout(15_000),
  });
}

/**
 * Checks, in order, that the token works, that it can see the repository, the branch and the workflow,
 * and that it may start workflows. Stops at the first problem and says what to fix.
 */
export async function checkGithubConnection({ repository, workflowFile, branch, token }: Target): Promise<ConnectionResult> {
  try {
    const repo = await get(`/repos/${repository}`, token);
    if (repo.status === 401) return { ok: false, message: "GitHub did not accept the access token. Check that it is correct and not expired." };
    if (repo.status === 403) return { ok: false, message: "GitHub refused the request. The token may lack access, or the rate limit was reached." };
    if (repo.status === 404) return { ok: false, message: `The repository ${repository} was not found, or the token cannot see it.` };
    if (!repo.ok) return { ok: false, message: `GitHub answered with HTTP ${repo.status} for the repository.` };
    const repoBody = (await repo.json()) as { permissions?: { push?: boolean; admin?: boolean } };

    const branchResponse = await get(`/repos/${repository}/branches/${encodeURIComponent(branch)}`, token);
    if (branchResponse.status === 404) return { ok: false, message: `The branch ${branch} was not found in ${repository}.` };
    if (!branchResponse.ok) return { ok: false, message: `GitHub answered with HTTP ${branchResponse.status} for the branch.` };

    const workflow = await get(`/repos/${repository}/actions/workflows/${encodeURIComponent(workflowFile)}`, token);
    if (workflow.status === 404) {
      return { ok: false, message: `The workflow ${workflowFile} was not found. Add it under .github/workflows on the default branch.` };
    }
    if (!workflow.ok) return { ok: false, message: `GitHub answered with HTTP ${workflow.status} for the workflow.` };
    const workflowBody = (await workflow.json()) as { state?: string };
    if (workflowBody.state && workflowBody.state !== "active") return { ok: false, message: `The workflow ${workflowFile} is disabled in GitHub. Turn it on under Actions.` };

    // Starting a workflow needs write access. Fine-grained tokens report the user's access here, not the token's,
    // so a token without the Actions permission can still pass this check.
    if (repoBody.permissions && !repoBody.permissions.push && !repoBody.permissions.admin) {
      return { ok: false, message: "The token can read the repository but not start workflows. Give it write access to Actions." };
    }
    return { ok: true, message: `Connected to ${repository}: branch ${branch} and workflow ${workflowFile} were found.` };
  } catch (error) {
    const reason = error instanceof Error && error.name === "TimeoutError" ? "GitHub did not answer within 15 seconds." : "GitHub could not be reached.";
    return { ok: false, message: `${reason} Check the internet connection.` };
  }
}
