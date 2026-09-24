import "server-only";
import { ciSettingsSchema, DEFAULT_WORKFLOW_FILE } from "./ci-config";
import { db } from "./db";
import { checkGithubConnection } from "./github";
import { decryptSecret, encryptSecret } from "./secrets";

/** What the page may show. The token itself never leaves the server. */
export async function getPlanConfig(teamId: string, planId: string) {
  const config = await db.planConfig.findFirst({
    where: { planId, plan: { teamId } },
    select: {
      mode: true,
      repository: true,
      workflowFile: true,
      branch: true,
      baseUrl: true,
      tokenHint: true,
      connectionStatus: true,
      connectionMessage: true,
      connectionCheckedAt: true,
    },
  });
  return (
    config ?? {
      mode: "local",
      repository: null,
      workflowFile: null,
      branch: null,
      baseUrl: null,
      tokenHint: null,
      connectionStatus: null,
      connectionMessage: null,
      connectionCheckedAt: null,
    }
  );
}
export type PlanConfigView = Awaited<ReturnType<typeof getPlanConfig>>;

export type SaveInput = { mode: string; repository: string; workflowFile: string; branch: string; baseUrl: string; token: string };
export type SaveResult = { ok: true; status?: "access" | "failed"; message?: string } | { ok: false; error: string };

/**
 * Saves a plan's configuration. Local needs nothing else. CI checks every field, keeps the saved token
 * when the token field is left empty, and then tests the connection to GitHub.
 */
export async function savePlanConfig(user: { id: string; teamId: string }, planId: string, input: SaveInput): Promise<SaveResult> {
  const plan = await db.testPlan.findFirst({ where: { id: planId, teamId: user.teamId }, select: { id: true, config: { select: { tokenEncrypted: true } } } });
  if (!plan) return { ok: false, error: "This test plan was not found in your team." };

  if (input.mode === "local") {
    await db.planConfig.upsert({
      where: { planId: plan.id },
      update: { mode: "local", updatedById: user.id },
      create: { planId: plan.id, mode: "local", updatedById: user.id },
    });
    return { ok: true };
  }
  if (input.mode !== "ci") return { ok: false, error: "Choose Local or CI." };

  const parsed = ciSettingsSchema.safeParse({ ...input, workflowFile: input.workflowFile || DEFAULT_WORKFLOW_FILE });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const newToken = input.token.trim();
  if (newToken.length > 500) return { ok: false, error: "The access token is too long." };
  if (!newToken && !plan.config?.tokenEncrypted) return { ok: false, error: "Enter a GitHub access token." };

  const tokenEncrypted = newToken ? encryptSecret(newToken) : plan.config!.tokenEncrypted!;
  const token = newToken || decryptSecret(tokenEncrypted);
  if (!token) return { ok: false, error: "The saved token can no longer be read. Enter it again." };

  const settings = parsed.data;
  const check = await checkGithubConnection({ ...settings, token });
  const data = {
    mode: "ci",
    provider: "github",
    repository: settings.repository,
    workflowFile: settings.workflowFile,
    branch: settings.branch,
    baseUrl: settings.baseUrl || null,
    tokenEncrypted,
    tokenHint: newToken ? newToken.slice(-4) : undefined,
    connectionStatus: check.ok ? "access" : "failed",
    connectionMessage: check.message,
    connectionCheckedAt: new Date(),
    updatedById: user.id,
  };
  await db.planConfig.upsert({ where: { planId: plan.id }, update: data, create: { planId: plan.id, ...data, tokenHint: data.tokenHint ?? null } });
  return { ok: true, status: check.ok ? "access" : "failed", message: check.message };
}

/** Checks the saved CI connection again without changing the settings. */
export async function retestConnection(teamId: string, planId: string): Promise<SaveResult> {
  const config = await db.planConfig.findFirst({ where: { planId, plan: { teamId } } });
  if (!config || config.mode !== "ci" || !config.repository || !config.workflowFile || !config.branch || !config.tokenEncrypted) {
    return { ok: false, error: "Save the CI settings first." };
  }
  const token = decryptSecret(config.tokenEncrypted);
  const check = token
    ? await checkGithubConnection({ repository: config.repository, workflowFile: config.workflowFile, branch: config.branch, token })
    : ({ ok: false, message: "The saved token can no longer be read. Enter it again." } as const);
  await db.planConfig.update({
    where: { id: config.id },
    data: { connectionStatus: check.ok ? "access" : "failed", connectionMessage: check.message, connectionCheckedAt: new Date() },
  });
  return { ok: true, status: check.ok ? "access" : "failed", message: check.message };
}
