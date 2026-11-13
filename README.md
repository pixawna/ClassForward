# ClassForward

Initial Next.js setup with App Router, TypeScript, Tailwind CSS, and ESLint.

## Requirements

Node.js 20.9 or newer and npm.

## Development

```sh
npm install
npm run dev
```

Open http://localhost:8080. Edit `app/page.tsx` to change the home page.

## Google sign-in

Sign-in uses [Better Auth](https://www.better-auth.com/) with Google. There is no database yet: each session lives in an encrypted cookie. Add a `database` to `lib/auth.ts` when you need to store users.

1. In [Google Cloud Console](https://console.cloud.google.com/), create or pick a project.
2. Go to **APIs & Services > OAuth consent screen** and set it up (app name, support email).
3. Go to **APIs & Services > Credentials > Create credentials > OAuth client ID**, choose **Web application**, and add:
   - Authorized JavaScript origin: `http://localhost:8080`
   - Authorized redirect URI: `http://localhost:8080/api/auth/callback/google`
4. Copy the client ID and secret into `.env.local` (see `.env.example`):

```sh
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

For production, add your real domain as a second origin and redirect URI in Google, and set `BETTER_AUTH_URL` to that domain.

After signing in, teachers land on `/classroom` (`app/classroom/page.tsx`).

## Checks

```sh
npm run lint
npm run typecheck
npm run build
```

## Production

```sh
npm run build
npm start
```

The `@/*` import alias resolves from the repository root. Dependencies are pinned by `package-lock.json`; use `npm ci` for reproducible installs.

Setup reference: https://nextjs.org/docs/app/getting-started/installation
