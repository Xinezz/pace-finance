# Setting up accounts (Supabase)

Accounts are optional. Without this setup Pace runs exactly as before: local-only, data stays in the browser.
With it, people sign in with an email and password and their data is saved to **their own private row in your
Supabase project**, available on any device.

Supabase has a free tier that is plenty for personal use. You create the project yourself (it needs your own
account); nothing here can be done for you.

## 1. Create a project

1. Sign up at <https://supabase.com> and click **New project**.
2. Pick a name, a strong database password (store it in a password manager; the app never needs it) and the region closest to you.

## 2. Create the table and security rules

1. In the project, open **SQL Editor → New query**.
2. Paste the whole contents of [`migrations/0001_user_data.sql`](migrations/0001_user_data.sql) and click **Run**.

That creates the `user_data` table and turns on **Row Level Security**: every query is limited to the signed-in
user's own row, and signed-out visitors can touch nothing. It also adds the "delete my account" function.
It is safe to run more than once.

## 3. Connect the app

1. In Supabase open **Project Settings → API**.
2. Copy the **Project URL** and the **anon public** key.
3. In the project folder: copy `.env.example` to `.env.local` and paste both values in.
4. Run `npm run dev`. You should now see the sign-in screen.

> **Never** use the `service_role` key anywhere in this project. It bypasses all security. The `anon` key is
> designed to be public; Row Level Security (step 2) is what protects the data.
> `.env.local` is git-ignored so keys are never committed.

## 4. Configure sign-in (Authentication in the Supabase dashboard)

- **URL Configuration:** set **Site URL** to where the app runs (`http://localhost:5173` while developing, your real
  address once deployed) and add the same addresses under **Redirect URLs**. Email links (confirm account, reset
  password) send people back there.
- **Sign In / Providers → Email:** keep **Confirm email** switched on. Raise the minimum password length to 10 or more.
- **Make it only yours (optional but recommended for a personal app):** create your own account first, then switch off
  **Allow new users to sign up**. Nobody else can create an account, while you keep signing in as normal.
- Consider turning on **leaked password protection** if your plan offers it.

## 5. Deploying

Any static host works (GitHub Pages, Netlify, Vercel, Cloudflare Pages). Build with `npm run build` and serve `dist/`.
Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the host's environment settings (they are baked in at build time).
Pace uses `#/` routes, so no special rewrite rules are needed. Serving over **HTTPS** is required for real use.

## Trying the screens without Supabase

`npm run dev:mock` swaps Supabase for a pretend backend inside your browser so you can try sign-up, sign-in,
password reset and the "changed on another device" prompt. It is clearly labelled in the UI and is **not secure**;
it only exists in the dev server and is stripped out of production builds.

## How your data is protected

- Passwords are handled entirely by Supabase Auth (hashed, never stored by this app).
- Each person's data is one row keyed to their user id; Row Level Security enforces "only your own row" inside the
  database, not just in the app.
- Saves carry a version number. If another device saved first, the app stops and asks which copy to keep instead of overwriting.
- Signing out reloads the page so nothing from the previous session stays in memory.
- Account deletion removes the login and, by cascade, all saved data.

## Limits to know about

- Two devices editing at once are protected from silent overwrites but not merged: you choose one version.
- The whole document is saved on each change, which is fine for personal use (years of transactions) but not for huge datasets.
- The client-side "too many tries" pause on the sign-in form is a courtesy; real rate limiting is enforced by Supabase.
- This has been tested against an in-browser fake of the backend and unit tests, **not against a live Supabase project**.
  Please run through sign-up, sign-in, reset and delete once on your own project before relying on it.
