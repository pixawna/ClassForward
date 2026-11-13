# Notes, sharing and classroom quizzes

Open any teacher-owned lesson. Use **Study notes & sharing** or **Review & host team quiz** below the video card.

## Notes

Write the video script first. Generate notes from its narration, learning objectives and saved sources, then edit and save them. Review the preview for definitions, concepts, examples, formulas, revision points and source links. Notes link to actual rendered chapter timestamps when available. The preview and shared reader offer **Print / Save as PDF**, using the browser print dialog.

Render the current video before publishing. Publishing copies the video and reviewed notes into an independent snapshot. Later draft edits do not appear in the shared lesson until republished. Choose anyone with the link or selected email addresses. Restricted viewers sign in with a verified allowed email. Turning sharing off blocks both the reader and media requests. Existing downloaded copies cannot be withdrawn.

## Classroom quiz

Generate questions from the script and objectives using the existing ANTHROPIC_API_KEY and CLAUDE_MODEL settings. Review and save questions, options, model answers, rubrics, explanations and follow-ups. Opening a room freezes this reviewed quiz. Students visit /quiz and enter the room code, or scan the locally generated QR code. Each team uses one device; its membership persists in an HttpOnly cookie. The same team name cannot be registered twice in a room.

The teacher starts each question, sees team submission counts, closes the round and reveals the answer. Only the teacher can advance, reveal, review scores or launch a follow-up. Students cannot retrieve answer keys or current-round scores before reveal. Choice scoring is deterministic: 100 or 0 points. Short explanations use Jev; correct earns 100 and partial 50 only when confidence is at least 0.8. Unclear, uncertain, failed or unconfigured evaluations await teacher review. The teacher can assign 0, 50 or 100 points. Results and the final concept summary remain stored at the room link.

Add TYPESAFE_API_KEY to .env.local for live Jev evaluation; optionally set JEV_MODEL (default jev-latest). Restart the dev server after changing configuration. Live Jev charges and access belong to that provider account; automated tests mock it and do not call it. Do not put provider secrets in browser code.

For phones, access the app using a reachable LAN or hosted URL before generating the QR code. localhost on a phone points to that phone, not the teacher laptop. Live updates use two-second polling and SQLite persistence; this implementation runs on the existing single-server deployment.

## Verification

npm test includes native SQLite room lifecycle, answer privacy, duplicate scoring, ownership, sharing/revocation, publication snapshot and Jev fallback tests. npm run lint, npm run typecheck and npm run build verify the application. These checks do not prove that a particular provider account has available credits or model access.

Notes and quiz generation use the provider’s strict JSON output schemas, followed by domain validation. To repeat the opt-in live generation check with your Anthropic account (uses credits), run:

```sh
CLASSFORWARD_LIVE_AI_TEST=1 node --env-file=.env.local node_modules/vitest/vitest.mjs run tests/learning-generation.live.test.ts
```

This check creates and removes a disposable database and does not edit your classroom lessons. The normal test command skips live provider calls.
