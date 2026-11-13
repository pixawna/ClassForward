# ClassForward implementation instructions

Implement only the accepted work order and its acceptance criteria. Read AGENTS.md and the affected code first. ClassForward serves high-school and college teachers: topic to story lesson, shareable notes, and classroom team quiz.

## Implementation

- Work on the branch assigned by SuperPlane. Follow the built-in implementation automation for committing, pushing, and opening the pull request.
- Preserve the existing notebook visual design and port 8080.
- Keep Google credentials, the OpenAlex API key, and session secrets on the server. Never copy .env.local or data/ into artifacts or Git.
- Check authentication and lesson ownership for every teacher-only read and write. Do not bypass authentication to make a demo work.
- Build notes and quizzes from the same reviewed learning objectives and source material as the story. Preserve citations.
- Treat team answers as evidence about the team response, not individual student mastery.
- Follow the existing SQLite conventions. Never delete user data to repair a schema problem.
- Add meaningful regression coverage for changed behavior when practical. Explain any coverage limitations.

## Verification and handoff

Run `node scripts/factory-verify.mjs` from the repository root. It runs lint, React component tests, route type generation, TypeScript, and the production build. A skipped, failed, or unavailable check is not a passing check.

Read the generated report and logs in `.factory-runs/`. Attach the report as private work-order evidence through the available artifact mechanism. Do not commit raw runtime artifacts.

For UI changes, exercise the real page and report the route and observed result. For authentication or provider integration changes, report which flows were actually tested; a build does not prove Google OAuth or a paid API works.

Return: resulting behavior, acceptance criteria met, checks performed, report path, and remaining limitations. Leave merge and deployment to the owner. Do not dispatch additional work orders.
