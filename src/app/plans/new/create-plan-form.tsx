"use client";

import { useActionState } from "react";
import { UploadFields } from "@/components/upload-fields";
import { createPlanAction, type UploadState } from "../actions";

export function CreatePlanForm() {
  const [state, formAction, pending] = useActionState<UploadState, FormData>(createPlanAction, {});
  return (
    <form action={formAction} className="form card">
      <label>
        Plan name
        <input name="name" type="text" maxLength={100} required defaultValue={state.name} placeholder="Checkout regression" />
      </label>
      <UploadFields state={state} />
      <button type="submit" disabled={pending}>
        {pending ? "Checking and scoring test cases…" : "Create test plan"}
      </button>
    </form>
  );
}
