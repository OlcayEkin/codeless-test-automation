"use client";

import { useActionState, useState } from "react";
import { REPEATS } from "@/lib/schedule";
import { startRunAction, type RunState } from "../../actions";

const plural = (n: number) => `${n} test case${n === 1 ? "" : "s"}`;

export function RunSettingsForm({ planId, counts }: { planId: string; counts: { web: number; api: number } }) {
  const [state, formAction, pending] = useActionState<RunState, FormData>(startRunAction.bind(null, planId), {});
  const [when, setWhen] = useState<"now" | "schedule">("now");
  const [startAt, setStartAt] = useState("");
  // datetime-local has no time zone; convert it here, in the user's own time zone.
  const startAtIso = startAt ? new Date(startAt).toISOString() : "";

  return (
    <form action={formAction} className="form card">
      <fieldset>
        <legend>Type of testing</legend>
        <label className="checkbox">
          <input type="checkbox" name="type" value="web" defaultChecked={counts.web > 0} disabled={!counts.web} />
          Web <span className="muted">· {plural(counts.web)}</span>
        </label>
        <label className="checkbox">
          <input type="checkbox" name="type" value="api" defaultChecked={counts.api > 0} disabled={!counts.api} />
          API <span className="muted">· {plural(counts.api)}</span>
        </label>
      </fieldset>

      <fieldset>
        <legend>Browser</legend>
        <label className="checkbox">
          <input type="radio" name="browser" value="chrome" defaultChecked />
          Google Chrome
        </label>
        <label className="checkbox muted">
          <input type="radio" name="browser" value="edge" disabled />
          Microsoft Edge <span className="badge">Coming later</span>
        </label>
        <label className="checkbox muted">
          <input type="radio" name="browser" value="firefox" disabled />
          Firefox <span className="badge">Coming later</span>
        </label>
      </fieldset>

      <fieldset>
        <legend>Browser window</legend>
        <label className="checkbox">
          <input type="checkbox" name="showBrowser" />
          Show the browser while testing
        </label>
        <p className="hint">Leave this off to run in the background (headless), which is faster.</p>
      </fieldset>

      <fieldset>
        <legend>When</legend>
        <label className="checkbox">
          <input type="radio" name="when" value="now" checked={when === "now"} onChange={() => setWhen("now")} />
          Run now
        </label>
        <label className="checkbox">
          <input type="radio" name="when" value="schedule" checked={when === "schedule"} onChange={() => setWhen("schedule")} />
          Schedule a date and repeat
        </label>
        {when === "schedule" && (
          <div className="schedule-fields">
            <label>
              Start date and time
              <input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} required />
            </label>
            <input type="hidden" name="startAtIso" value={startAtIso} />
            <label>
              Repeat
              <select name="repeat" defaultValue="once">
                {Object.entries(REPEATS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <p className="hint">Scheduled runs start while this computer and the app are running.</p>
          </div>
        )}
      </fieldset>

      {state.error && (
        <p role="alert" className="error">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending}>
        {pending ? (when === "now" ? "Starting…" : "Saving…") : when === "now" ? "▶ Run tests" : "Save schedule"}
      </button>
    </form>
  );
}
