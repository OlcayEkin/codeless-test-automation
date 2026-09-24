# Codeless Test Automation

A proof of concept for running automated browser and API tests without writing code.
Teams upload test cases as Excel, CSV or JSON, run them in Chrome with Playwright, and review the results.

## How it works

```mermaid
flowchart TD
    A([Open login page]) --> B{Login successful?}
    B -- No --> C[Show login error] --> A
    B -- Yes --> D([Dashboard])

    D --> E{Test plan already exists?}

    %% Test plan creation
    E -- No --> F([Create test plan])
    F --> G[/Upload test cases<br/>Excel, CSV or JSON/]
    G --> H([Validate and score each test case])
    H --> I{Valid?}
    I -- No --> G
    I -- Yes --> K[Test plan created]
    K --> L

    %% Execution setup
    E -- Yes --> L([Configure test run])
    L --> M([Test type: Web, API or both])
    M --> N([Headless: on or off])
    N --> O([Browser: Chrome])
    O --> P{Run now or schedule?}
    P -- Now --> Q([Press Run tests])
    P -- Schedule --> R([Pick start date and repeat])
    R --> Q2([Scheduler starts run])
    Q --> S[Worker runs the tests]
    Q2 --> S

    %% Reporting
    S --> T([Run finished])
    T --> U([Notify the user])
    U --> V([Show Pass/Fail/Blocked chart])
    V --> W([List failures with screenshot, video and trace])
    W --> X([User tags each failure:<br/>bug or test blockage])
    X --> Y{Create follow-up plan<br/>for failed tests?}
    Y -- Yes --> F2([New plan with only the failed tests]) --> L
    Y -- No --> Z[Test reporting complete]
```

Scheduling and notifications are the next phase; everything else in the chart is built.
The full plan, with phases and safety rules, is in [docs/plan/codeless-flow.html](docs/plan/codeless-flow.html). Download it and open it in a browser.

## Setup

Requires Node.js 20 or newer and Google Chrome.

```bash
npm install
cp .env.example .env.local        # then fill in the values below
npx prisma migrate deploy
npm run db:seed                   # creates the QA Team and an admin user, and prints its password
npm run dev                       # web app on http://localhost:3001 plus the background test worker
```

`.env.local` needs:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | SQLite file, for example `file:./data/dev.db` |
| `SESSION_SECRET` | At least 32 random characters, for example from `openssl rand -base64 48` |
| `TYPESAFE_API_KEY` | Optional. Enables quality scoring and failure suggestions |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` | Optional. Choose the seeded admin's login |

## Everyday commands

| Command | What it does |
|---|---|
| `npm run dev` | Web app and worker together |
| `npm run user:create -- --username name --password '…'` | Add a team member (`--role ADMIN` for an admin) |
| `npm run tests:run -- --plan "Plan name"` | Run a saved plan from the terminal |
| `npm run check` | Type check, lint, end-to-end tests and the Jev code review |

## Project layout

| Folder | Contents |
|---|---|
| `src/app` | Next.js pages and server actions |
| `src/lib` | Data access, auth, the test case format and importers |
| `src/runner` | The Playwright runner that executes test steps |
| `scripts` | Worker, command-line runner, user and database helpers |
| `tests` | Playwright end-to-end and unit tests |
| `prisma` | Database schema and migrations |
