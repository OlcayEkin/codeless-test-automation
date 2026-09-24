/**
 * Code quality gate powered by Jev (TypeSafe System One).
 *
 * Usage:
 *   npm run quality:jev                 # reviews changed files, or all source files if nothing changed
 *   npm run quality:jev -- src/lib/a.ts  # reviews the given files
 *
 * Jev returns probabilities, not opinions in prose. This script turns them into a pass or fail
 * using the thresholds below. It complements TypeScript, ESLint and tests; it does not replace them.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { extname, relative, resolve } from "node:path";
import { config } from "dotenv";
import { askJev, type JevQuestion, type NoulAnswer, type ScoreAnswer } from "../src/lib/jev";

config({ path: ".env.local", quiet: true });

const MAX_FILE_BYTES = 40_000;
const REVIEWED_DIRS = ["src/", "prisma/", "scripts/", "tests/"];
const REVIEWED_EXTENSIONS = new Set([".ts", ".tsx", ".mts"]);
const NEVER_SEND = [/(^|\/)\.env/, /(^|\/)src\/generated\//, /(^|\/)node_modules\//, /(^|\/)data\//];

// A file fails when any rule is crossed. Tune these as we learn how Jev scores this codebase.
const THRESHOLDS = {
  maxHardcodedSecret: 0.5,
  maxUnsafeInput: 0.5,
  maxUnhandledFailure: 0.6,
  minReadability: 1.5,
};

// Jev sees one file at a time, so describe the safety nets that live in other files.
const PROJECT_CONTEXT =
  "Next.js App Router project. Errors thrown in server components and pages are caught by app/error.tsx, " +
  "which shows a friendly retry page. redirect() from next/navigation intentionally throws to navigate. " +
  "Command-line scripts in scripts/ and prisma/ are run by developers, and a crash with a stack trace is acceptable there.";

const QUESTIONS: Record<keyof Answers, JevQuestion> = {
  hardcoded_secret: {
    type: "noul",
    instructions:
      "Does `code` contain a real hard-coded secret, such as an API key, password, token or private key? Obvious test-only fixtures, placeholder names and values read from environment variables do not count.",
  },
  unsafe_input: {
    type: "noul",
    instructions:
      "Does `code` pass untrusted input (form data, uploaded files, URL parameters or request bodies) into a database query, file path, shell command, HTML or code evaluation without validating or escaping it first?",
  },
  unhandled_failure: {
    type: "noul",
    instructions:
      "Given `project_context`, does `code` contain an operation that can realistically fail at runtime (network, database, file system or parsing) where the failure is silently swallowed, or would reach an end user as a crash that no error boundary or handler covers?",
  },
  readability: {
    type: "score",
    instructions:
      "How easy is `code` for a new TypeScript developer on the team to read, change and review safely? Judge naming, function size, structure and whether intent is clear.",
    criteria: [
      "Hard to follow: unclear names, long tangled functions or hidden side effects.",
      "Understandable with effort: some confusing parts or mixed responsibilities.",
      "Clear: sensible names and structure, minor improvements possible.",
      "Very clear: small focused units, obvious intent, easy to change safely.",
    ],
  },
};

type Answers = {
  hardcoded_secret: NoulAnswer;
  unsafe_input: NoulAnswer;
  unhandled_failure: NoulAnswer;
  readability: ScoreAnswer;
};

function isReviewable(file: string) {
  return (
    REVIEWED_DIRS.some((dir) => file.startsWith(dir)) &&
    REVIEWED_EXTENSIONS.has(extname(file)) &&
    !NEVER_SEND.some((pattern) => pattern.test(file))
  );
}

function git(args: string[]) {
  try {
    return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

function filesToReview(cliArgs: string[]): string[] {
  const root = process.cwd();
  const requested = cliArgs.map((file) => relative(root, resolve(file)));
  const candidates = requested.length
    ? requested
    : [...new Set([...git(["diff", "--name-only", "HEAD"]), ...git(["ls-files", "--others", "--exclude-standard"])])];
  const fallback = candidates.length ? candidates : git(["ls-files"]);
  return fallback.filter(isReviewable).filter((file) => {
    try {
      return statSync(file).isFile();
    } catch {
      return false;
    }
  });
}

function problemsFor(a: Answers): string[] {
  const problems: string[] = [];
  if (a.hardcoded_secret.noul > THRESHOLDS.maxHardcodedSecret) problems.push("possible hard-coded secret");
  if (a.unsafe_input.noul > THRESHOLDS.maxUnsafeInput) problems.push("possible unvalidated input");
  if (a.unhandled_failure.noul > THRESHOLDS.maxUnhandledFailure) problems.push("possible unhandled failure");
  if (a.readability.score < THRESHOLDS.minReadability) problems.push("hard to read");
  return problems;
}

async function main() {
  const apiKey = process.env.TYPESAFE_API_KEY;
  if (!apiKey) {
    console.error("TYPESAFE_API_KEY is not set. Add it to .env.local.");
    process.exit(2);
  }

  const files = filesToReview(process.argv.slice(2));
  if (!files.length) {
    console.log("Jev review: no source files to review.");
    return;
  }

  console.log(`Jev review of ${files.length} file(s)\n`);
  console.log("secret  input  failure  readability  file");
  let failed = 0;

  for (const file of files) {
    const code = readFileSync(file, "utf8");
    if (Buffer.byteLength(code) > MAX_FILE_BYTES) {
      console.log(`   -      -       -          -       ${file}  (skipped: larger than ${MAX_FILE_BYTES} bytes)`);
      continue;
    }
    const answers = await askJev<Answers>({ project_context: PROJECT_CONTEXT, file, code }, QUESTIONS, { apiKey });
    const problems = problemsFor(answers);
    if (problems.length) failed++;
    const pct = (n: number) => `${Math.round(n * 100)}%`.padStart(5);
    console.log(
      `${pct(answers.hardcoded_secret.noul)}  ${pct(answers.unsafe_input.noul)}   ${pct(answers.unhandled_failure.noul)}    ` +
        `${answers.readability.score.toFixed(2)} / 3    ${file}${problems.length ? `  <- ${problems.join(", ")}` : ""}`,
    );
  }

  console.log(`\n${failed ? `${failed} file(s) need review.` : "All files passed."}`);
  if (failed) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(2);
});
