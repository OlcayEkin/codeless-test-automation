import type { TestCaseQuality } from "@/lib/test-cases/quality";
import { describeQuality } from "@/lib/test-cases/quality-text";
import { DeleteTestCaseButton } from "./delete-test-case-button";

type Step = { id: string; description: string | null; action: string; target: string | null; value: string | null; expected: string | null };
type TestCase = { id: string; externalId: string; name: string; quality: unknown; steps: Step[] };

/** The plan's test cases, each expandable to its steps and our first review. Delete only on the latest version. */
export function TestCaseList({ plan, testCases, editable }: { plan: { id: string }; testCases: TestCase[]; editable: boolean }) {
  return (
    <section aria-label="Test cases" className="cases">
      {testCases.map((testCase) => {
        const quality = testCase.quality as TestCaseQuality | null;
        return (
          <details key={testCase.id} className="case card">
            <summary>
              <span className="case-id">{testCase.externalId}</span>
              <span className="case-name">{testCase.name}</span>
              <span className="muted">{testCase.steps.length} steps</span>
              {quality?.flags.map((flag) => (
                <span key={flag} className="badge warn">
                  {flag}
                </span>
              ))}
              {quality && !quality.flags.length && <span className="badge ok">Looks good</span>}
              {editable && <DeleteTestCaseButton planId={plan.id} testCaseId={testCase.id} externalId={testCase.externalId} />}
            </summary>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Description</th>
                    <th>Action</th>
                    <th>Target</th>
                    <th>Value</th>
                    <th>Expected result</th>
                  </tr>
                </thead>
                <tbody>
                  {testCase.steps.map((step, i) => (
                    <tr key={step.id}>
                      <td>{i + 1}</td>
                      <td className="wrap">{step.description}</td>
                      <td>
                        <code>{step.action}</code>
                      </td>
                      <td className="wrap">{step.target}</td>
                      <td className="wrap">{step.value}</td>
                      <td className="wrap">{step.expected}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {quality && (
              <div className="review">
                <p className="review-title">Our first review:</p>
                <ul>
                  {describeQuality(quality).map((note) => (
                    <li key={note.text} className={`note ${note.tone}`}>
                      <span aria-hidden="true" className="note-icon">
                        {note.tone === "good" ? "✓" : "!"}
                      </span>
                      {note.text}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </details>
        );
      })}
    </section>
  );
}
