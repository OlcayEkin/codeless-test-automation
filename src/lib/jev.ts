/**
 * Minimal client for Jev, TypeSafe's System One model. Used by the app and by scripts/jev-review.ts.
 * Keep API keys server-side: never import this from a client component.
 */

const API_URL = "https://api.typesafe.ai/v1/systemone";
const MODEL = "jev-latest";

export type NoulAnswer = { type: "noul"; noul: number };
export type ScoreAnswer = { type: "score"; score: number; confidence: number };
export type JevQuestion =
  | { type: "noul"; instructions: string }
  | { type: "score"; instructions: string; criteria: string[] };

export class JevError extends Error {}

export async function askJev<Answers>(
  state: unknown,
  questions: Record<string, JevQuestion>,
  { apiKey = process.env.TYPESAFE_API_KEY, timeoutMs = 60_000, attempt = 1 }: { apiKey?: string; timeoutMs?: number; attempt?: number } = {},
): Promise<Answers> {
  if (!apiKey) throw new JevError("TYPESAFE_API_KEY is not set.");

  let response: Response;
  try {
    response = await fetch(API_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: MODEL, state, questions }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    throw new JevError(`Could not reach Jev: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Rate limited or overloaded: back off and retry a few times.
  if ((response.status === 429 || response.status === 529) && attempt < 4) {
    await new Promise((done) => setTimeout(done, 1000 * 2 ** attempt));
    return askJev(state, questions, { apiKey, timeoutMs, attempt: attempt + 1 });
  }
  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 300);
    throw new JevError(`Jev request failed with HTTP ${response.status}: ${detail}`);
  }
  const body = (await response.json()) as { answers: Answers };
  return body.answers;
}
