"use client";

import { useActionState, useState } from "react";
import { DEFAULT_WORKFLOW_FILE, githubWorkflowYaml } from "@/lib/ci-config";
import { retestConnectionAction, saveConfigurationAction, type ConfigState } from "../actions";

type Config = {
  mode: string;
  repository: string | null;
  workflowFile: string | null;
  branch: string | null;
  baseUrl: string | null;
  tokenHint: string | null;
  connectionStatus: string | null;
  connectionMessage: string | null;
  connectionCheckedAt: string | null;
};

/** Where this plan's tests run: this computer (no settings) or GitHub Actions (connection settings). */
export function ConfigurationSection({ planId, config }: { planId: string; config: Config }) {
  const [state, formAction, pending] = useActionState<ConfigState, FormData>(saveConfigurationAction.bind(null, planId), {});
  const [mode, setMode] = useState(config.mode === "ci" ? "ci" : "local");
  const [copied, setCopied] = useState(false);
  const savedCi = config.mode === "ci" && config.connectionStatus;

  return (
    <section className="card" aria-labelledby="configuration-heading">
      <h2 id="configuration-heading">Configuration</h2>

      {savedCi && (
        <div className={`connection ${config.connectionStatus}`} role="status" aria-label="Connection status">
          <strong>{config.connectionStatus === "access" ? "ACCESS" : "FAILED TO CONNECT"}</strong>
          <span>{config.connectionMessage}</span>
          {config.connectionCheckedAt && (
            <span className="muted small">Checked {new Date(config.connectionCheckedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</span>
          )}
        </div>
      )}
      {config.mode === "ci" && (
        <form action={retestConnectionAction.bind(null, planId)} className="retest">
          <button type="submit" className="secondary small-button">
            Test connection again
          </button>
        </form>
      )}

      {/* Radios are uncontrolled: React resets forms after an action, and they must then show the saved mode. */}
      <form action={formAction} className="form config-form" onReset={() => setMode(config.mode === "ci" ? "ci" : "local")}>
        <fieldset>
          <legend>Where tests run</legend>
          <label className="checkbox">
            <input type="radio" name="mode" value="local" defaultChecked={config.mode !== "ci"} onChange={() => setMode("local")} />
            Local <span className="muted">· on this computer, no settings needed</span>
          </label>
          <label className="checkbox">
            <input type="radio" name="mode" value="ci" defaultChecked={config.mode === "ci"} onChange={() => setMode("ci")} />
            CI <span className="muted">· GitHub Actions</span>
          </label>
        </fieldset>

        {mode === "ci" && (
          <div className="ci-fields">
            <label>
              Repository
              <input name="repository" defaultValue={config.repository ?? ""} placeholder="my-org/my-app" required autoComplete="off" />
            </label>
            <label>
              Workflow file
              <input name="workflowFile" defaultValue={config.workflowFile ?? DEFAULT_WORKFLOW_FILE} required autoComplete="off" />
            </label>
            <label>
              Branch
              <input name="branch" defaultValue={config.branch ?? "main"} required autoComplete="off" />
            </label>
            <label>
              <span>
                Base address <span className="muted">(optional)</span>
              </span>
              <input name="baseUrl" defaultValue={config.baseUrl ?? ""} placeholder="https://staging.example.com" autoComplete="off" />
              <span className="hint">Used by steps whose page address is a path, such as /login.</span>
            </label>
            <label>
              Access token
              <input
                name="token"
                type="password"
                autoComplete="off"
                required={!config.tokenHint}
                placeholder={config.tokenHint ? `Saved token ending in ${config.tokenHint}; leave empty to keep it` : "github_pat_…"}
              />
              <span className="hint">
                A fine-grained GitHub token for this repository with <strong>Actions: read and write</strong> and <strong>Contents: read</strong>. It is stored
                encrypted and never shown again.
              </span>
            </label>

            <details className="workflow">
              <summary>Workflow file to add to your repository</summary>
              <p className="hint">
                Save it as <code>.github/workflows/{DEFAULT_WORKFLOW_FILE}</code> on the default branch. It runs the tests with the runner from{" "}
                <code>OlcayEkin/codeless-test-automation</code>.
              </p>
              <pre className="code">
                <code>{githubWorkflowYaml()}</code>
              </pre>
              <button
                type="button"
                className="secondary small-button"
                onClick={() => navigator.clipboard.writeText(githubWorkflowYaml()).then(() => setCopied(true), () => setCopied(false))}
              >
                {copied ? "Copied" : "Copy workflow"}
              </button>
            </details>
          </div>
        )}

        {state.error && (
          <p role="alert" className="error">
            {state.error}
          </p>
        )}
        <button type="submit" disabled={pending}>
          {pending ? (mode === "ci" ? "Saving and connecting…" : "Saving…") : mode === "ci" ? "Save and test connection" : "Save"}
        </button>
        {state.saved && !pending && mode === "local" && <p className="muted small">Saved. Tests run on this computer.</p>}
        {config.mode === "ci" && <p className="hint">Runs still use this computer for now. Sending runs to GitHub Actions is the next step.</p>}
      </form>
    </section>
  );
}
