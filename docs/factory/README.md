# ClassForward software factory

This directory contains the ClassForward-specific inputs for a local SuperPlane factory. It is not a SuperPlane Canvas export. The factory uses SuperPlane's built-in implementation automation, then owner review.

## Intended flow

Draft work order -> accepted scope -> built-in Implement automation -> verification evidence -> pull request -> owner review -> merge.

Factory name: ClassForward. Workspace key: CF. Repository: pixawna/ClassForward. Default branch: main. Start with one work order at a time. Set implementation max parallelism to 1 on its line. Keep automatic merge disabled.

## Run SuperPlane locally

Docker Desktop must be running. From `/Users/pixawna/Documents/Github/superplane`, use the repository's supported commands:

```sh
export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"
make dev.up
make dev.setup
make dev.server
make doctor-local
```

Open http://localhost:8000 and complete owner setup. Never recreate or delete an existing database to fix setup.

Local repository automation needs a stable HTTPS tunnel to port 8000. Configure BASE_URL and WEBHOOKS_BASE_URL in the SuperPlane repository's gitignored .env to that same URL. Follow `docs/contributing/connecting-to-3rdparty-services-from-development.md` in the SuperPlane repository. Do not put ClassForward's Google credentials into SuperPlane's environment.

## Connect the factory

1. Create the ClassForward workspace with key CF.
2. Use Connect to create or install the local instance's GitHub App. Select pixawna/ClassForward. GitHub identity sign-in uses a separate OAuth App when enabled; use the callback documented by SuperPlane.
3. Connect the agent provider you want to use in workspace setup. This requires that provider's credentials in SuperPlane, separate from the ClassForward app.
4. Select the built-in implementation automation. Set its line step maximum parallelism to 1.
5. Under workspace Agent setup steps, set the setup command for pixawna/ClassForward to `npm ci`. Use Node 22 or newer and the native build tools required by better-sqlite3, plus Python 3.9 or newer for the Scrapy source finder (`python3 -m venv scraper/.venv && scraper/.venv/bin/pip install -r scraper/requirements.txt`).
6. Include `docs/factory/agent-instructions.md` in each accepted work order. The built-in agent reads repository instructions as well.
7. For verification, run `node scripts/factory-verify.mjs` in the checked-out repository. Capture its `.factory-runs/<timestamp>/report.json` and logs as work-order artifacts. A report alone is not an enforced merge gate: review it before merging.
8. Copy a task from work-orders.json into the backlog. Approve and dispatch only the task you want implemented. The JSON is a task source, not an import format.

Push the factory files with the application changes you want the remote runner to see. Remote runners clone GitHub; they cannot see uncommitted laptop files. Do not dispatch against an older remote main and assume it contains your local work.

## Verification

```sh
node scripts/factory-verify.mjs
```

The script exits nonzero on the first failed check and saves the actual commit, branch, dirty status, command outcomes, and logs. It does not install dependencies, invent API credentials, or claim external services were tested. Use `npm ci` in a fresh runner checkout first. Reports are ignored by Git.

## Hackathon evidence

Show one accepted work order, its implementation run, the resulting pull request, actual verification report, and your review decision. Demonstrate a ClassForward feature made by that run. Keep artifacts from failed attempts visible. A deployed lesson pipeline alone is not evidence of a software development factory.

## Optional API bootstrap after owner setup

The included bootstrap uses the REST routes in the supplied SuperPlane source. Live provisioning still requires an authenticated local instance. It creates the CF workspace if absent, preserves existing setup commands, adds `npm ci` if no setup exists, and seeds missing draft tasks. It does not create integrations, complete onboarding, dispatch tasks, merge, or deploy.

Preview without credentials:

```sh
node scripts/factory-bootstrap.mjs --dry-run
```

After owner setup, create an organization API token in local SuperPlane. Export it as `SUPERPLANE_TOKEN` in your terminal, then run:

```sh
SUPERPLANE_URL=http://localhost:8000 node scripts/factory-bootstrap.mjs
```

Do not put tokens in the command text, repository, screenshots, or chat. The script accepts localhost URLs only and does not print the token. If a response is interrupted, rerun: existing workspace, setup commands, and task titles are preserved. Run one bootstrap process at a time.

## Pull-request checks

`.github/workflows/factory-verify.yml` runs the same verification script on pull requests, pushes to main, or a manual workflow dispatch. It uses an ephemeral build-only auth secret, not application credentials, and uploads the report and command logs even after a check fails. It also runs the Scrapy source-finder tests against a local fake site. Live Google, Wikimedia, OpenAlex, and Jev calls are not exercised by this check.

After this workflow has run on GitHub, configure the repository ruleset to require **Factory verification** before merge. Until that rule is configured, the check is visible but does not block merges. In SuperPlane, keep auto-merge disabled and inspect the PR checks in Verify. This workflow is for ClassForward; SuperPlane's own CI remains unchanged.
