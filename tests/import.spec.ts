/**
 * Unit tests for the Excel, CSV and JSON importers. They run without a browser.
 */
import { expect, test } from "@playwright/test";
import { parseUpload } from "../src/lib/test-cases/parse";
import { SAMPLE_TEST_CASES, toCsv, toJson, toXlsx } from "../src/lib/test-cases/templates";

const utf8 = (text: string) => new TextEncoder().encode(text);
const HEADER = "test_case_id,test_case_name,step,action,target,value,expected_result";
const csv = (...rows: string[]) => utf8([HEADER, ...rows].join("\n"));

async function errorsFor(fileName: string, bytes: Uint8Array) {
  const result = await parseUpload(fileName, bytes);
  expect(result.ok, "upload should be rejected").toBe(false);
  return result.ok ? [] : result.issues.map((issue) => `${issue.location}: ${issue.message}`);
}

test.describe("templates", () => {
  test("Excel, CSV and JSON templates import to the same test cases", async () => {
    const results = await Promise.all([
      parseUpload("t.xlsx", await toXlsx(SAMPLE_TEST_CASES)),
      parseUpload("t.csv", utf8(toCsv(SAMPLE_TEST_CASES))),
      parseUpload("t.json", utf8(toJson(SAMPLE_TEST_CASES))),
    ]);
    for (const result of results) {
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.testCases).toEqual(SAMPLE_TEST_CASES);
        expect(result.warnings).toEqual([]);
      }
    }
  });
});

test.describe("file type checks", () => {
  test("rejects unsupported extensions, old .xls and empty files", async () => {
    expect(await errorsFor("tests.txt", utf8("hello"))).toEqual(["File: Only Excel (.xlsx), CSV (.csv) and JSON (.json) files are accepted."]);
    expect((await errorsFor("tests.xls", utf8("x")))[0]).toContain("Old .xls files are not supported");
    expect(await errorsFor("tests.csv", new Uint8Array())).toEqual(["File: The file is empty."]);
  });

  test("checks the content, not just the file name", async () => {
    expect(await errorsFor("renamed.xlsx", utf8(HEADER))).toEqual(["File: This file is named .xlsx but is not a real Excel file."]);
    const excel = await toXlsx(SAMPLE_TEST_CASES);
    expect((await errorsFor("renamed.csv", excel))[0]).toContain("contains binary data");
    expect(await errorsFor("latin1.csv", new Uint8Array([0x61, 0xe9, 0x62]))).toEqual(["File: The file is not UTF-8 text. Save it again as UTF-8."]);
  });
});

test.describe("CSV and Excel rows", () => {
  test("reports missing columns", async () => {
    const errors = await errorsFor("t.csv", utf8("test_case_id,step\nTC-1,1"));
    expect(errors).toEqual(["Row 1: Missing column(s): test_case_name, action. Download a template to see the expected columns."]);
  });

  test("points at the exact row for each problem", async () => {
    const errors = await errorsFor(
      "t.csv",
      csv(
        "TC-1,Login,1,open,javascript:alert(1),,",
        "TC-1,Login,2,teleport,#x,,",
        "TC-1,Login,2,click,#button,,",
        "TC-1,Other name,3,expect_visible,#ok,,",
        "TC-2,Status,x,expect_status,,abc,",
        ",No id,1,click,#a,,",
      ),
    );
    expect(errors).toEqual([
      'Row 2: Target "javascript:alert(1)" must be a full http(s) URL or a path starting with /.',
      'Row 3: Unknown action "teleport". Allowed actions: open, click, hover, fill, select, check, uncheck, press, wait_for, expect_visible, expect_hidden, expect_text, expect_url, expect_title, api_request, expect_status.',
      'Row 4: Test case "TC-1" already has step 2 on row 3.',
      'Row 5: Test case "TC-1" has a different name than on row 2.',
      'Row 6: step must be a whole number of 1 or more, not "x".',
      "Row 7: test_case_id is empty.",
    ]);
  });

  test("checks which fields each action needs", async () => {
    const errors = await errorsFor("t.csv", csv("TC-1,A,1,click,,,", "TC-1,A,2,expect_url,#x,/home,", "TC-1,A,3,api_request,https://x.test,FETCH,"));
    expect(errors).toEqual([
      'Row 2: Action "click" needs a target.',
      'Row 3: Action "expect_url" does not use a target. Leave it empty.',
      'Row 4: Value "FETCH" is not an HTTP method. Use one of GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS.',
    ]);
  });

  test("sorts steps by number, accepts header variations and warns about tests without checks", async () => {
    const result = await parseUpload(
      "t.csv",
      utf8(["Test Case ID,Test Case Name,Step,Action,Target,Value,Expected Result", "TC-9,Hover menu,2,hover,#menu,,", "TC-9,,1,open,/home,,"].join("\n")),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.testCases[0].steps.map((s) => s.action)).toEqual(["open", "hover"]);
    expect(result.warnings.map((w) => w.message)).toEqual(['Test case "TC-9" has no check step (an expect_ action), so it can never fail.']);
  });

  test("reports broken CSV quoting", async () => {
    expect((await errorsFor("t.csv", csv('TC-1,"Unclosed,1,click,#a,,')))[0]).toContain("The CSV file is not valid");
  });
});

test.describe("JSON", () => {
  test("points at the exact field for each problem", async () => {
    const json = JSON.stringify({
      testCases: [
        { id: "TC-1", name: "Login", steps: [{ action: "click" }] },
        { id: "TC-1", name: "", steps: [] },
      ],
    });
    expect(await errorsFor("t.json", utf8(json))).toEqual([
      "testCases[1].name: Must not be empty.",
      "testCases[1].steps: A test case needs at least one step.",
    ]);

    const second = JSON.stringify({ testCases: [{ id: "TC-1", name: "A", steps: [{ action: "click" }] }, { id: "TC-1", name: "B", steps: [{ action: "expect_status", value: 200 }] }] });
    expect(await errorsFor("t.json", utf8(second))).toEqual([
      'testCases[0].steps[0]: Action "click" needs a target.',
      'testCases[1].id: Test case id "TC-1" is also used by testCases[0].',
    ]);
  });

  test("reports invalid JSON syntax", async () => {
    expect((await errorsFor("t.json", utf8("{ not json")))[0]).toMatch(/^File: The JSON is not valid/);
  });
});

test.describe("quality wording", () => {
  test("turns Jev scores into plain sentences that agree with the flags", async () => {
    const { describeQuality } = await import("../src/lib/test-cases/quality-text");
    const tones = (scores: { clarity: number; verifiesGoal: number; fragileSelectors: number }) => describeQuality(scores).map((note) => note.tone);
    expect(tones({ clarity: 2.9, verifiesGoal: 0.91, fragileSelectors: 0.09 })).toEqual(["good", "good", "good"]);
    expect(tones({ clarity: 2.0, verifiesGoal: 0.6, fragileSelectors: 0.45 })).toEqual(["fair", "fair", "fair"]);
    // These values are exactly what raises the three flags in quality.ts.
    expect(tones({ clarity: 1.3, verifiesGoal: 0.1, fragileSelectors: 0.98 })).toEqual(["poor", "poor", "poor"]);
    expect(describeQuality({ clarity: 2.9, verifiesGoal: 0.91, fragileSelectors: 0.09 })[0].text).toBe("The steps are clear and easy to follow.");
  });
});

test.describe("schedules", () => {
  // Thursday 24 September 2026, 09:00 local time.
  const at = (day: number, hour = 9, minute = 0) => new Date(2026, 8, day, hour, minute);
  const thursday = at(24);

  test("works out the next run for each repeat option", async () => {
    const { nextRunAfter } = await import("../src/lib/schedule");
    expect(nextRunAfter(thursday, "once", at(23))).toEqual(thursday);
    expect(nextRunAfter(thursday, "once", at(24, 9, 1))).toBeNull();
    expect(nextRunAfter(thursday, "daily", at(24))).toEqual(at(25));
    expect(nextRunAfter(thursday, "weekly", at(24, 10))).toEqual(new Date(2026, 9, 1, 9, 0)); // Thursday 1 Oct
    // Friday's run is followed by Monday's, skipping the weekend.
    expect(nextRunAfter(thursday, "weekdays", at(25, 9, 30))).toEqual(at(28));
    // A weekday schedule that starts on a Saturday first runs on Monday.
    expect(nextRunAfter(at(26), "weekdays", at(25))).toEqual(at(28));
  });

  test("skips missed times instead of catching up", async () => {
    const { nextRunAfter } = await import("../src/lib/schedule");
    const monthsLater = new Date(2027, 2, 10, 12, 0);
    const next = nextRunAfter(thursday, "daily", monthsLater)!;
    expect(next).toEqual(new Date(2027, 2, 11, 9, 0));
  });

  test("describes schedules in words", async () => {
    const { describeSchedule } = await import("../src/lib/schedule");
    expect(describeSchedule("weekdays", thursday)).toBe("Every weekday at 09:00");
    expect(describeSchedule("weekly", thursday)).toBe("Every Thursday at 09:00");
    expect(describeSchedule("once", thursday)).toBe("Once, on Thu 24 Sept, 09:00");
  });

  test("words the finished-run notification", async () => {
    const { runNotification } = await import("../src/lib/notify");
    const base = { id: "r", planName: "Smoke", total: 4, scheduled: false, status: "completed" };
    expect(runNotification({ ...base, passed: 4, failed: 0, blocked: 0 }).title).toBe("✅ Smoke: all 4 passed");
    expect(runNotification({ ...base, passed: 1, failed: 2, blocked: 1, scheduled: true })).toEqual({
      title: "❌ Smoke: 2 failed, 1 blocked",
      body: "Scheduled run finished: 1 passed, 2 failed, 1 blocked, of 4. Review the failures and tag them as bugs or test blockages.",
    });
  });
});
