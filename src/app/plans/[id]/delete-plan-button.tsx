"use client";

import { useActionState, useState } from "react";
import { deletePlanAction, type DeleteState } from "../actions";

/** Two-step delete: the first click only asks for confirmation. */
export function DeletePlanButton({ planId, planName, versionCount }: { planId: string; planName: string; versionCount: number }) {
  const [confirming, setConfirming] = useState(false);
  const [state, formAction, pending] = useActionState<DeleteState, FormData>(deletePlanAction.bind(null, planId), {});

  if (!confirming) {
    return (
      <button type="button" className="secondary" onClick={() => setConfirming(true)}>
        Delete test plan
      </button>
    );
  }

  return (
    <form action={formAction} className="confirm" aria-label="Confirm delete">
      <p>
        Delete <strong>{planName}</strong> and all {versionCount} version{versionCount === 1 ? "" : "s"}? This cannot be undone.
      </p>
      {state.error && (
        <p role="alert" className="error">
          {state.error}
        </p>
      )}
      <div className="actions">
        <button type="submit" className="danger" disabled={pending}>
          {pending ? "Deleting…" : "Yes, delete"}
        </button>
        <button type="button" className="secondary" onClick={() => setConfirming(false)} disabled={pending}>
          Cancel
        </button>
      </div>
    </form>
  );
}
