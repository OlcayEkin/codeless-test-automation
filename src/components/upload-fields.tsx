import type { UploadState } from "@/app/plans/actions";

/** File picker, template links and the list of problems from the last upload. */
export function UploadFields({ state }: { state: UploadState }) {
  return (
    <>
      <label>
        Test case file
        <input name="file" type="file" accept=".xlsx,.csv,.json" required />
        <span className="hint">
          Excel (.xlsx), CSV or JSON, up to 5 MB. Start from a template:{" "}
          <a href="/templates/test-cases.xlsx" download>
            Excel
          </a>
          ,{" "}
          <a href="/templates/test-cases.csv" download>
            CSV
          </a>{" "}
          or{" "}
          <a href="/templates/test-cases.json" download>
            JSON
          </a>
          .
        </span>
      </label>

      {state.error && (
        <div role="alert" className="error-box">
          <p className="error">{state.error}</p>
          {!!state.issues?.length && (
            <ul className="issues" aria-label="Problems in the file">
              {state.issues.map((issue, i) => (
                <li key={i}>
                  <strong>{issue.location}:</strong> {issue.message}
                </li>
              ))}
              {!!state.hiddenIssueCount && <li>…and {state.hiddenIssueCount} more.</li>}
            </ul>
          )}
        </div>
      )}
    </>
  );
}
