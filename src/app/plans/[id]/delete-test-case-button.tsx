"use client";

import { startTransition, useActionState, useState, type MouseEvent } from "react";
import { deleteTestCaseAction, type DeleteState } from "../actions";

/**
 * Lives inside the test case's <summary>, so every click stops the default toggle of the details box.
 * The first click only asks for confirmation.
 */
export function DeleteTestCaseButton({ planId, testCaseId, externalId }: { planId: string; testCaseId: string; externalId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [state, runDelete, pending] = useActionState<DeleteState, void>(deleteTestCaseAction.bind(null, planId, testCaseId), {});

  const handle = (callback: () => void) => (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    callback();
  };

  return (
    <span className="case-actions">
      {!confirming ? (
        <button type="button" className="secondary small-button" aria-label={`Delete test case ${externalId}`} onClick={handle(() => setConfirming(true))}>
          Delete
        </button>
      ) : (
        <span className="inline-confirm" role="group" aria-label={`Confirm deleting ${externalId}`}>
          <span>Delete {externalId}?</span>
          <button type="button" className="danger small-button" disabled={pending} onClick={handle(() => startTransition(() => runDelete()))}>
            {pending ? "Deleting…" : "Yes, delete"}
          </button>
          <button type="button" className="secondary small-button" disabled={pending} onClick={handle(() => setConfirming(false))}>
            Cancel
          </button>
        </span>
      )}
      {state.error && (
        <span role="alert" className="error small">
          {state.error}
        </span>
      )}
    </span>
  );
}
