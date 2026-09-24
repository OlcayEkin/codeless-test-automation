"use client";

import { useActionState, useState } from "react";
import { ACTIONS, checkStep, type Action } from "@/lib/test-cases/format";
import { createTestCaseAction, type CreateCaseState } from "../../../actions";

type DraftStep = { description: string; action: Action | ""; target: string; value: string; expected: string };
const emptyStep = (): DraftStep => ({ description: "", action: "", target: "", value: "", expected: "" });

/** Plain-language names and field labels for each action. The rules themselves live in format.ts. */
const ACTION_UI: Record<Action, { label: string; target?: string; value?: string; placeholder?: { target?: string; value?: string } }> = {
  open: { label: "Open a page", target: "Page address", placeholder: { target: "https://example.com/login or /login" } },
  click: { label: "Click", target: "Element to click", placeholder: { target: "#submit, button[type=submit]" } },
  hover: { label: "Hover over", target: "Element", placeholder: { target: "#menu" } },
  fill: { label: "Type into a field", target: "Field", value: "Text to type", placeholder: { target: "#username", value: "tomsmith" } },
  select: { label: "Choose from a dropdown", target: "Dropdown", value: "Option to choose", placeholder: { target: "#country", value: "Turkey" } },
  check: { label: "Tick a checkbox", target: "Checkbox", placeholder: { target: "#terms" } },
  uncheck: { label: "Untick a checkbox", target: "Checkbox", placeholder: { target: "#newsletter" } },
  press: { label: "Press a key", target: "Element", value: "Key to press", placeholder: { target: "#search", value: "Enter" } },
  wait_for: { label: "Wait for an element", target: "Element to wait for", placeholder: { target: ".results" } },
  expect_visible: { label: "Check: element is visible", target: "Element", placeholder: { target: "#welcome" } },
  expect_hidden: { label: "Check: element is hidden", target: "Element", placeholder: { target: ".spinner" } },
  expect_text: { label: "Check: element shows text", target: "Element", value: "Text it should contain", placeholder: { target: "#flash", value: "You logged in" } },
  expect_url: { label: "Check: page address contains", value: "Part of the address", placeholder: { value: "/dashboard" } },
  expect_title: { label: "Check: page title contains", value: "Part of the title", placeholder: { value: "Dashboard" } },
  api_request: { label: "Call an API", target: "API address", value: "HTTP method (GET if empty)", placeholder: { target: "https://api.example.com/health", value: "GET" } },
  expect_status: { label: "Check: API status code", value: "Expected status code", placeholder: { value: "200" } },
};
const GROUPS: { label: string; actions: Action[] }[] = [
  { label: "Go somewhere", actions: ["open", "api_request"] },
  { label: "Do something", actions: ["click", "hover", "fill", "select", "check", "uncheck", "press", "wait_for"] },
  { label: "Check the result", actions: ["expect_text", "expect_visible", "expect_hidden", "expect_url", "expect_title", "expect_status"] },
];

function problemsFor(step: DraftStep): string[] {
  if (!step.action) return ["Choose an action."];
  return checkStep({ action: step.action, target: step.target.trim() || undefined, value: step.value || undefined });
}

function summary(step: DraftStep) {
  if (!step.action) return "No action yet";
  const ui = ACTION_UI[step.action];
  return [ui.label, step.target, step.value && `“${step.value}”`].filter(Boolean).join(" · ");
}

export function CreateTestCaseForm({ planId, baseVersion }: { planId: string; baseVersion: number }) {
  const [state, formAction, pending] = useActionState<CreateCaseState, FormData>(createTestCaseAction.bind(null, planId, baseVersion), {});
  const [title, setTitle] = useState("");
  const [steps, setSteps] = useState<DraftStep[]>([emptyStep()]);
  const [open, setOpen] = useState(0);
  const [showProblems, setShowProblems] = useState(false);

  const update = (index: number, change: Partial<DraftStep>) => setSteps((all) => all.map((s, i) => (i === index ? { ...s, ...change } : s)));
  const current = steps[open];
  const currentProblems = current ? problemsFor(current) : [];
  const allProblems = steps.flatMap((step, i) => problemsFor(step).map((p) => `Step ${i + 1}: ${p}`));
  const hasCheck = steps.some((step) => step.action.startsWith("expect_"));

  // "Test case done? No": finish this step and start the next one.
  const addStep = () => {
    if (currentProblems.length) return setShowProblems(true);
    setShowProblems(false);
    setSteps((all) => [...all, emptyStep()]);
    setOpen(steps.length);
  };
  const removeStep = (index: number) => {
    setSteps((all) => all.filter((_, i) => i !== index));
    setOpen((o) => Math.max(0, o >= index ? o - 1 : o));
  };

  const payload = JSON.stringify({
    name: title,
    steps: steps.map((s) => ({ description: s.description, action: s.action, target: s.target, value: s.value, expected: s.expected })),
  });

  return (
    <form
      action={formAction}
      className="form"
      onSubmit={(event) => {
        if (allProblems.length || !title.trim()) {
          event.preventDefault();
          setShowProblems(true);
        }
      }}
    >
      <section className="card form">
        <label>
          Test case title
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required placeholder="Valid user can log in" />
        </label>
      </section>

      <ol className="step-list" aria-label="Steps">
        {steps.map((step, index) =>
          index === open ? (
            <li key={index} className="card form step-editor" aria-label={`Step ${index + 1}`}>
              <div className="step-head">
                <h2>Step {index + 1}</h2>
                {steps.length > 1 && (
                  <button type="button" className="secondary small-button" onClick={() => removeStep(index)}>
                    Remove step
                  </button>
                )}
              </div>
              <label>
                <span>
                  Description <span className="muted">(optional)</span>
                </span>
                <input value={step.description} onChange={(e) => update(index, { description: e.target.value })} placeholder="Enter a valid username" />
              </label>
              <div className="field">
                <label htmlFor={`action-${index}`}>Action</label>
                <select id={`action-${index}`} value={step.action} onChange={(e) => update(index, { action: e.target.value as Action, target: "", value: "" })} required>
                  <option value="">Choose what this step does…</option>
                  {GROUPS.map((group) => (
                    <optgroup key={group.label} label={group.label}>
                      {group.actions.map((action) => (
                        <option key={action} value={action}>
                          {ACTION_UI[action].label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                {step.action && <span className="hint">{ACTIONS[step.action].description}</span>}
              </div>
              {step.action && ACTIONS[step.action].target !== "none" && (
                <label>
                  {ACTION_UI[step.action].target}
                  <input value={step.target} onChange={(e) => update(index, { target: e.target.value })} placeholder={ACTION_UI[step.action].placeholder?.target} />
                  {(ACTIONS[step.action] as { targetKind?: string }).targetKind === "selector" && <span className="hint">A CSS selector, like #id or .class, or text=Sign in.</span>}
                </label>
              )}
              {step.action && ACTIONS[step.action].value !== "none" && (
                <label>
                  {ACTION_UI[step.action].value}
                  <input value={step.value} onChange={(e) => update(index, { value: e.target.value })} placeholder={ACTION_UI[step.action].placeholder?.value} />
                </label>
              )}
              <label>
                <span>
                  Expected result <span className="muted">(optional, a note for people)</span>
                </span>
                <input value={step.expected} onChange={(e) => update(index, { expected: e.target.value })} placeholder="The login page is shown" />
              </label>
              {showProblems && currentProblems.length > 0 && (
                <ul role="alert" className="issues">
                  {currentProblems.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              )}
            </li>
          ) : (
            <li key={index} className="card step-summary">
              <span className="case-id">Step {index + 1}</span>
              <span>
                {step.description && <strong>{step.description} · </strong>}
                {summary(step)}
              </span>
              <button
                type="button"
                className="secondary small-button"
                onClick={() => {
                  setShowProblems(false);
                  setOpen(index);
                }}
              >
                Edit
              </button>
            </li>
          ),
        )}
      </ol>

      <div className="card form">
        <p className="done-question">Is the test case done?</p>
        {!hasCheck && <p className="hint">Tip: add a “Check” step, or this test can never fail.</p>}
        <input type="hidden" name="testCase" value={payload} />
        {showProblems && allProblems.length > 0 && (
          <p className="error">Fix the steps marked above before saving.</p>
        )}
        {state.error && (
          <div role="alert" className="error-box">
            <p className="error">{state.error}</p>
            {state.issues && (
              <ul className="issues">
                {state.issues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            )}
          </div>
        )}
        <div className="done-actions">
          <button type="button" className="secondary" onClick={addStep}>
            No, add another step
          </button>
          <button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Yes, save test case to plan"}
          </button>
        </div>
      </div>
    </form>
  );
}
