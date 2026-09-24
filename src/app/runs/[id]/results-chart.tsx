/**
 * Pass / Fail / Blocked as one stacked bar (a part-to-whole view).
 * Status colors never carry meaning alone: every segment has an icon and a label,
 * failed segments are striped, and the results table below lists every test.
 * While a run is in progress the unfilled track shows what is still to come.
 */

const SEGMENTS = [
  { key: "passed", icon: "✓", label: "passed" },
  { key: "failed", icon: "✗", label: "failed" },
  { key: "blocked", icon: "■", label: "blocked" },
] as const;

type Counts = { passed: number; failed: number; blocked: number; total: number };

export function ResultsChart({ passed, failed, blocked, total, finished }: Counts & { finished: boolean }) {
  const counts = { passed, failed, blocked };
  const done = passed + failed + blocked;
  const passRate = done ? Math.round((passed / done) * 100) : 0;
  const summary = SEGMENTS.map((s) => `${counts[s.key]} ${s.label}`).join(", ");

  return (
    <figure className="results-chart" aria-label={`Test results: ${summary}, of ${total} tests.`}>
      {finished && done > 0 && (
        <p className="hero-number">
          <strong>{passRate}%</strong> passed
        </p>
      )}
      <div className="stack" role="img" aria-label={summary}>
        {SEGMENTS.filter((s) => counts[s.key] > 0).map((s) => {
          const share = (counts[s.key] / Math.max(total, 1)) * 100;
          return (
            <span
              key={s.key}
              className={`segment ${s.key}`}
              style={{ flexBasis: `${share}%` }}
              data-tooltip={`${s.icon} ${counts[s.key]} ${s.label} · ${Math.round((counts[s.key] / Math.max(done, 1)) * 100)}% of finished tests`}
              tabIndex={0}
            >
              {share >= 12 && (
                <span className="segment-label">
                  {s.icon} {counts[s.key]}
                </span>
              )}
            </span>
          );
        })}
      </div>
      <figcaption className="legend">
        {SEGMENTS.map((s) => (
          <span key={s.key} className={`legend-item ${s.key}`}>
            <span className="swatch" aria-hidden="true" />
            {s.icon} {counts[s.key]} {s.label}
          </span>
        ))}
        <span className="muted">of {total}</span>
      </figcaption>
    </figure>
  );
}
