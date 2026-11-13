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
