import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";

/**
 * Google sign-in, no database (yet).
 *
 * With no `database` option, Better Auth keeps each session in an encrypted
 * cookie, so nothing has to be stored server-side. When ClassForward needs to
 * save lessons and classes, add a database here and sessions move into it.
 */
if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
  console.warn(
    "[ClassForward] GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is missing. Copy .env.example to .env.local and add your Google OAuth keys.",
  );
}

export const auth = betterAuth({
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
      // Always show the account chooser: teachers often have a school and a personal account.
      prompt: "select_account",
    },
  },
  // Lets server actions set the session cookie. Keep this last in the list.
  plugins: [nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
