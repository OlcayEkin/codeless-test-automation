import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { getRunFile } from "@/lib/runs";
import { getSession, isActive } from "@/lib/session";
import { db } from "@/lib/db";

const RESULTS_DIR = resolve(process.env.RESULTS_DIR || "results");
const KINDS = { screenshot: "image/png", trace: "application/zip", video: "video/webm" } as const;
const FILE_NAMES = { screenshot: "screenshot.png", trace: "trace.zip", video: "video.webm" } as const;

type Params = { params: Promise<{ id: string; resultId: string; kind: string }> };

// Route handlers are not covered by app/error.tsx, so failures get a plain message here.
export async function GET(request: Request, context: Params) {
  try {
    return await serveFile(context);
  } catch (error) {
    console.error("Serving a run file failed", error);
    return new Response("The file could not be loaded. Please try again.", { status: 500 });
  }
}

async function serveFile({ params }: Params) {
  const session = await getSession();
  if (!isActive(session)) return new Response("Sign in to see run files.", { status: 401 });
  const user = await db.user.findUnique({ where: { id: session.userId }, select: { teamId: true } });
  if (!user) return new Response("Sign in to see run files.", { status: 401 });

  const { id, resultId, kind } = await params;
  if (!Object.hasOwn(KINDS, kind)) return new Response("Not found.", { status: 404 });
  const file = await getRunFile(user.teamId, id, resultId, kind as keyof typeof KINDS);
  if (!file) return new Response("Not found.", { status: 404 });

  // Paths come from the worker, but check anyway that they stay inside this run's folder.
  const runDir = resolve(RESULTS_DIR, id);
  const fullPath = resolve(runDir, file.path);
  if (!fullPath.startsWith(runDir + sep)) return new Response("Not found.", { status: 404 });

  try {
    const body = await readFile(fullPath);
    const name = `${file.testCaseId.replace(/[^\w.-]+/g, "_")}-${FILE_NAMES[kind as keyof typeof KINDS]}`;
    return new Response(new Uint8Array(body), {
      headers: {
        "Content-Type": KINDS[kind as keyof typeof KINDS],
        "Content-Disposition": `${kind === "trace" ? "attachment" : "inline"}; filename="${name}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return new Response("The file is no longer available.", { status: 404 });
  }
}
