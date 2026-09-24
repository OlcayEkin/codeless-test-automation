import Link from "next/link";

type Version = { version: number; fileName: string; createdAt: Date; uploadedBy: { name: string } };
const formatDate = (date: Date) => date.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });

export function VersionList({ planId, versions, current }: { planId: string; versions: Version[]; current: number }) {
  return (
    <section className="card">
      <h2>Versions</h2>
      <ol className="versions" reversed>
        {versions.map((v) => (
          <li key={v.version}>
            {v.version === current ? (
              <strong>Version {v.version}</strong>
            ) : (
              <Link href={`/plans/${planId}?version=${v.version}`}>Version {v.version}</Link>
            )}{" "}
            <span className="muted">
              · {v.fileName} · {v.uploadedBy.name} · {formatDate(v.createdAt)}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
