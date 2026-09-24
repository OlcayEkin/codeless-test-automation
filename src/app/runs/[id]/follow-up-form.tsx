"use client";

import { useActionState } from "react";
import { createFollowUpAction, type FollowUpState } from "@/app/plans/actions";

type Failure = { id: string; testCaseId: string; name: string; status: string };

/** Lets the user pick which failed or blocked tests go into a new plan. All are picked by default. */
export function FollowUpForm({ runId, planName, failures }: { runId: string; planName: string; failures: Failure[] }) {
  const [state, formAction, pending] = useActionState<FollowUpState, FormData>(createFollowUpAction.bind(null, runId), {});
  const date = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short" });

  return (
    <form action={formAction} className="form">
      <label>
        New plan name
        <input name="name" type="text" maxLength={100} required defaultValue={`${planName} – follow-up ${date}`} />
      </label>
      <fieldset>
        <legend>Tests to include</legend>
        {failures.map((failure) => (
          <label key={failure.id} className="checkbox">
            <input type="checkbox" name="result" value={failure.id} defaultChecked />
            <span className="case-id">{failure.testCaseId}</span> {failure.name}
            <span className="muted">· {failure.status}</span>
          </label>
        ))}
      </fieldset>
      {state.error && (
        <p role="alert" className="error">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending}>
        {pending ? "Creating…" : "Create follow-up plan"}
      </button>
    </form>
  );
}
