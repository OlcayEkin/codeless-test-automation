import { getSession, isActive } from "@/lib/session";
import { TEMPLATE_FILES, renderTemplate, type TemplateFile } from "@/lib/test-cases/templates";

export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  if (!isActive(await getSession())) return new Response("Sign in to download templates.", { status: 401 });

  const { file } = await params;
  if (!Object.hasOwn(TEMPLATE_FILES, file)) return new Response("Template not found.", { status: 404 });

  const body = await renderTemplate(file as TemplateFile);
  return new Response(typeof body === "string" ? body : new Uint8Array(body), {
    headers: {
      "Content-Type": TEMPLATE_FILES[file as TemplateFile],
      "Content-Disposition": `attachment; filename="${file}"`,
      "Cache-Control": "no-store",
    },
  });
}
