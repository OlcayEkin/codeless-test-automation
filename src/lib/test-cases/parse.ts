/**
 * Turns an uploaded Excel, CSV or JSON file into test cases, or a list of problems with exact locations.
 * Uploaded content is only ever read as data. Nothing in it is executed or evaluated.
 */
import { parse as parseCsvText } from "csv-parse/sync";
import { readSheet } from "read-excel-file/node";
import { z } from "zod";
import {
  COLUMNS,
  IMPORT_LIMITS,
  REQUIRED_COLUMNS,
  checkStep,
  structuralWarnings,
  type Column,
  type ImportFormat,
  type ImportIssue,
  type ImportResult,
  type TestCaseInput,
  type TestStepInput,
} from "./format";

const ZIP_SIGNATURE = [0x50, 0x4b, 0x03, 0x04]; // Every .xlsx file is a zip archive.

export async function parseUpload(fileName: string, bytes: Uint8Array): Promise<ImportResult> {
  const detected = detectFormat(fileName, bytes);
  if (!detected.ok) return { ok: false, issues: [fileIssue(detected.message)] };
  const { format } = detected;

  try {
    if (format === "json") return finish(format, parseJsonText(decodeText(bytes)));
    const rows = format === "csv" ? parseCsvRows(decodeText(bytes)) : await readExcelRows(bytes);
    return finish(format, rowsToTestCases(rows));
  } catch (error) {
    const message = error instanceof UploadError ? error.message : `The ${format.toUpperCase()} file could not be read. Check that it is not damaged.`;
    return { ok: false, format, issues: [fileIssue(message)] };
  }
}

// ---------------------------------------------------------------------------------------------
// File type checks

type Detected = { ok: true; format: ImportFormat } | { ok: false; message: string };

export function detectFormat(fileName: string, bytes: Uint8Array): Detected {
  const extension = fileName.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
  if (bytes.byteLength === 0) return { ok: false, message: "The file is empty." };
  if (bytes.byteLength > IMPORT_LIMITS.maxFileBytes) {
    return { ok: false, message: `The file is larger than ${IMPORT_LIMITS.maxFileBytes / 1024 / 1024} MB.` };
  }

  const looksLikeZip = ZIP_SIGNATURE.every((byte, i) => bytes[i] === byte);
  switch (extension) {
    case "xlsx":
      return looksLikeZip ? { ok: true, format: "xlsx" } : { ok: false, message: "This file is named .xlsx but is not a real Excel file." };
    case "csv":
    case "json":
      return looksLikeZip
        ? { ok: false, message: `This file is named .${extension} but contains binary data. Is it an Excel file?` }
        : { ok: true, format: extension };
    case "xls":
      return { ok: false, message: "Old .xls files are not supported. In Excel, use Save As and choose .xlsx." };
    default:
      return { ok: false, message: "Only Excel (.xlsx), CSV (.csv) and JSON (.json) files are accepted." };
  }
}

class UploadError extends Error {}

function decodeText(bytes: Uint8Array): string {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new UploadError("The file is not UTF-8 text. Save it again as UTF-8.");
  }
  if (text.includes("\u0000")) throw new UploadError("The file contains binary data, not text.");
  return text.replace(/^﻿/, "");
}

const fileIssue = (message: string): ImportIssue => ({ severity: "error", location: "File", message });

// ---------------------------------------------------------------------------------------------
// Excel and CSV: rows of cells, one row per step

type Cell = string | number | boolean | Date | null | undefined;

function parseCsvRows(text: string): Cell[][] {
  try {
    return parseCsvText(text, { skip_empty_lines: true, relax_column_count: true, trim: true }) as string[][];
  } catch (error) {
    const line = (error as { lines?: number }).lines;
    throw new UploadError(`The CSV file is not valid${line ? ` near line ${line}` : ""}. Check quotes and commas.`);
  }
}

async function readExcelRows(bytes: Uint8Array): Promise<Cell[][]> {
  // The first sheet holds the test cases. Formulas are read as their saved results, never calculated.
  return (await readSheet(Buffer.from(bytes))) as Cell[][];
}

function cellText(cell: Cell): string {
  if (cell === null || cell === undefined) return "";
  if (cell instanceof Date) return cell.toISOString();
  return String(cell).trim();
}

const normalizeHeader = (header: string) => header.trim().toLowerCase().replace(/[\s\-/]+/g, "_");

/** Groups step rows into test cases. Row numbers in messages match what the user sees in Excel. */
export function rowsToTestCases(rows: Cell[][]): ParsedCases {
  const issues: ImportIssue[] = [];
  const [headerRow, ...dataRows] = rows;
  if (!headerRow) return { testCases: [], issues: [fileIssue("The file has no header row.")] };

  const headers = headerRow.map((cell) => normalizeHeader(cellText(cell)));
  const columnIndex = new Map<Column, number>();
  for (const column of COLUMNS) {
    const index = headers.indexOf(column);
    if (index >= 0) columnIndex.set(column, index);
  }
  const missing = REQUIRED_COLUMNS.filter((column) => !columnIndex.has(column));
  if (missing.length) {
    return {
      testCases: [],
      issues: [{ severity: "error", location: "Row 1", message: `Missing column(s): ${missing.join(", ")}. Download a template to see the expected columns.` }],
    };
  }

  const byId = new Map<string, { testCase: TestCaseInput; firstRow: number; stepNumbers: Map<number, number>; ordered: { n: number; step: TestStepInput }[] }>();

  dataRows.forEach((row, index) => {
    const rowNumber = index + 2;
    const where = `Row ${rowNumber}`;
    const get = (column: Column) => {
      const i = columnIndex.get(column);
      return i === undefined ? "" : cellText(row[i]);
    };
    if (row.every((cell) => cellText(cell) === "")) return;

    const tooLong = COLUMNS.find((column) => get(column).length > IMPORT_LIMITS.maxCellLength);
    if (tooLong) {
      issues.push({ severity: "error", location: where, message: `Column ${tooLong} is longer than ${IMPORT_LIMITS.maxCellLength} characters.` });
      return;
    }

    const id = get("test_case_id");
    const name = get("test_case_name");
    const stepText = get("step");
    const action = get("action").toLowerCase();
    if (!id) {
      issues.push({ severity: "error", location: where, message: "test_case_id is empty." });
      return;
    }

    let group = byId.get(id);
    if (!group) {
      if (!name) issues.push({ severity: "error", location: where, message: `test_case_name is empty for the first row of test case "${id}".` });
      group = { testCase: { id, name, steps: [] }, firstRow: rowNumber, stepNumbers: new Map(), ordered: [] };
      byId.set(id, group);
    } else if (name && name !== group.testCase.name) {
      issues.push({ severity: "error", location: where, message: `Test case "${id}" has a different name than on row ${group.firstRow}.` });
    }

    const stepNumber = Number(stepText);
    if (!Number.isInteger(stepNumber) || stepNumber < 1) {
      issues.push({ severity: "error", location: where, message: `step must be a whole number of 1 or more, not "${stepText}".` });
      return;
    }
    const previousRow = group.stepNumbers.get(stepNumber);
    if (previousRow) {
      issues.push({ severity: "error", location: where, message: `Test case "${id}" already has step ${stepNumber} on row ${previousRow}.` });
      return;
    }
    group.stepNumbers.set(stepNumber, rowNumber);

    const step: TestStepInput = {
      description: get("description") || undefined,
      action: action as TestStepInput["action"],
      target: get("target") || undefined,
      value: get("value") || undefined,
      expected: get("expected_result") || undefined,
    };
    for (const message of checkStep(step)) issues.push({ severity: "error", location: where, message });
    group.ordered.push({ n: stepNumber, step });
  });

  const testCases = [...byId.values()].map(({ testCase, ordered }) => ({
    ...testCase,
    steps: ordered.sort((a, b) => a.n - b.n).map(({ step }) => step),
  }));
  if (!testCases.length && !issues.length) issues.push(fileIssue("The file has a header row but no test steps."));
  return { testCases, issues };
}

// ---------------------------------------------------------------------------------------------
// JSON: { "testCases": [ { "id", "name", "steps": [ { "action", "target", "value", "expected" } ] } ] }

const text = (max: number = IMPORT_LIMITS.maxCellLength) => z.string().trim().max(max, `Must be at most ${max} characters.`);
const jsonSchema = z.object({
  testCases: z
    .array(
      z.object({
        id: text(200).min(1, "Must not be empty."),
        name: text().min(1, "Must not be empty."),
        steps: z
          .array(
            z.object({
              description: text().optional(),
              action: z.string().trim().toLowerCase(),
              target: text().optional(),
              value: z.union([text(), z.number().transform(String)]).optional(),
              expected: text().optional(),
            }),
          )
          .min(1, "A test case needs at least one step."),
      }),
    )
    .min(1, "Add at least one test case."),
});

function jsonPath(path: PropertyKey[]) {
  return path.reduce<string>((out, part) => (typeof part === "number" ? `${out}[${part}]` : out ? `${out}.${String(part)}` : String(part)), "") || "File";
}

export function parseJsonText(source: string): ParsedCases {
  let data: unknown;
  try {
    data = JSON.parse(source);
  } catch (error) {
    return { testCases: [], issues: [fileIssue(`The JSON is not valid: ${(error as Error).message}`)] };
  }

  const parsed = jsonSchema.safeParse(data);
  if (!parsed.success) {
    return {
      testCases: [],
      issues: parsed.error.issues.map((issue) => ({ severity: "error", location: jsonPath(issue.path), message: issue.message })),
    };
  }

  const issues: ImportIssue[] = [];
  const seen = new Map<string, number>();
  const testCases = parsed.data.testCases.map((testCase, caseIndex) => {
    const earlier = seen.get(testCase.id);
    if (earlier !== undefined) {
      issues.push({ severity: "error", location: `testCases[${caseIndex}].id`, message: `Test case id "${testCase.id}" is also used by testCases[${earlier}].` });
    }
    seen.set(testCase.id, caseIndex);

    const steps = testCase.steps.map((step, stepIndex) => {
      const clean: TestStepInput = {
        description: step.description || undefined,
        action: step.action as TestStepInput["action"],
        target: step.target || undefined,
        value: step.value || undefined,
        expected: step.expected || undefined,
      };
      for (const message of checkStep(clean)) issues.push({ severity: "error", location: `testCases[${caseIndex}].steps[${stepIndex}]`, message });
      return clean;
    });
    return { id: testCase.id, name: testCase.name, steps };
  });
  return { testCases, issues };
}

// ---------------------------------------------------------------------------------------------
// Shared limits and final result

type ParsedCases = { testCases: TestCaseInput[]; issues: ImportIssue[] };

function finish(format: ImportFormat, { testCases, issues }: ParsedCases): ImportResult {
  const limitIssues: ImportIssue[] = [];
  const totalSteps = testCases.reduce((sum, testCase) => sum + testCase.steps.length, 0);
  if (testCases.length > IMPORT_LIMITS.maxTestCases) limitIssues.push(fileIssue(`The file has ${testCases.length} test cases. The limit is ${IMPORT_LIMITS.maxTestCases}.`));
  if (totalSteps > IMPORT_LIMITS.maxTotalSteps) limitIssues.push(fileIssue(`The file has ${totalSteps} steps. The limit is ${IMPORT_LIMITS.maxTotalSteps}.`));
  for (const testCase of testCases) {
    if (testCase.steps.length > IMPORT_LIMITS.maxStepsPerCase) {
      limitIssues.push(fileIssue(`Test case "${testCase.id}" has ${testCase.steps.length} steps. The limit is ${IMPORT_LIMITS.maxStepsPerCase}.`));
    }
  }

  const errors = [...limitIssues, ...issues.filter((issue) => issue.severity === "error")];
  if (errors.length) return { ok: false, format, issues: errors };

  const warnings = testCases.flatMap((testCase) => structuralWarnings(testCase, `Test case ${testCase.id}`));
  return { ok: true, format, testCases, warnings };
}
