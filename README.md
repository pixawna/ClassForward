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

## Finding sources (Scrapy)

When a teacher plans a lesson, ClassForward finds sources to cite with [Scrapy](https://www.scrapy.org), a Python crawler in `scraper/`:

- Every lesson searches Wikipedia and Wikibooks; high-school lessons also search Simple English Wikipedia.
- College lessons also search open-access research papers on [OpenAlex](https://openalex.org) when `OPENALEX_API_KEY` is set (a free key from openalex.org/settings/api).
- Results are ranked against the lesson's level and learning objectives.
- Teachers can paste their own link; Scrapy reads its title, authors and date for the citation, and obeys the site's robots.txt.

One-time setup (Python 3.9 or newer):

```sh
cd scraper
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

The app finds `scraper/.venv` on its own. To try the crawler by hand:

```sh
echo '{"mode":"search","topic":"Photosynthesis","level":"high_school"}' | scraper/.venv/bin/python scraper/find_sources.py
```

Its tests run offline against a local fake site:

```sh
scraper/.venv/bin/python -m unittest discover -s scraper/tests -v
```

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
