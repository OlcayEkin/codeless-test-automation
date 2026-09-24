"use client";

import { useActionState } from "react";
import { UploadFields } from "@/components/upload-fields";
import { uploadVersionAction, type UploadState } from "../actions";

export function UploadVersionForm({ planId }: { planId: string }) {
  const [state, formAction, pending] = useActionState<UploadState, FormData>(uploadVersionAction.bind(null, planId), {});
  return (
    <form action={formAction} className="form">
      <UploadFields state={state} />
      <button type="submit" disabled={pending}>
        {pending ? "Checking and scoring test cases…" : "Upload new version"}
      </button>
    </form>
  );
}
