# Demo script

A 10-minute walkthrough of the proof of concept for stakeholders. It needs an internet connection, because the demo tests run against a public practice site.

## Before the meeting

1. Start the app: `npm run dev`. Keep the terminal visible; the worker's part shows the email that would be sent.
2. Sign in at http://localhost:3001 as the admin.
3. Optional: run `npm run demo:seed -- --run` ten minutes early, so a finished run is ready to show if the network is slow during the meeting.

## 1. The problem (1 minute)

Writing automated tests needs developers. This tool lets testers write tests in a spreadsheet, and runs them in a real browser.

## 2. Load and inspect a plan (2 minutes)

1. On **Test plans**, press **Load demo plan**.
2. Open a test case to show its steps: open a page, fill a field, click, check the text.
3. Point out **Our first review** under each test case: it checks that steps are clear, that the checks prove the test's goal, and that page elements are found in a stable way.
4. Mention that plans come from Excel, CSV or JSON uploads, and that every file is checked before anything is saved. The **Create test plan** page has templates in all three formats.

## 3. Run it (3 minutes)

1. Press **▶ Run tests**. Show the choices: Web or API tests, Chrome, headless or visible, run now or on a schedule.
2. Tick **Show the browser while testing** if you want the audience to watch Chrome click through the tests.
3. Press **▶ Run tests** and watch the progress bar fill live.

## 4. Review the results (3 minutes)

1. Show the **75% passed** headline and the Pass/Fail/Blocked bar.
2. Open the failed test **TC-004**. It fails on purpose: it expects a greeting the page does not have.
3. Open its **Screenshot** and **Video** to show exactly what the browser saw.
4. Read **Our first review**: it suggests this is a test problem, not a bug in the site. Tag it as **Test blockage**.
5. Press **Create follow-up plan** to put the failed test into its own plan for a re-run after the fix.
6. Show the **🔔** bell: the person who started the run is notified, and gets an email when they have an address.

## 5. Scheduling (1 minute)

On the demo plan, press **▶ Run tests**, choose **Schedule a date and repeat**, and pick **Every weekday**. The plan page now lists the schedule with its next run time.

## If something goes wrong

| Problem | Fix |
|---|---|
| The run stays on "Waiting for the worker to start" | The worker is not running. Restart `npm run dev`. |
| Tests are blocked with a timeout on step 1 | The practice site is unreachable. Show the finished run from `demo:seed -- --run` instead. |
| No "Our first review" text | `TYPESAFE_API_KEY` is missing from `.env.local`. The rest of the demo still works. |
