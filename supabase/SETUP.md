# Setting up accounts (Supabase)

Accounts are optional. Without this setup Pace runs exactly as before: local-only, data stays in the browser.
With it, people sign in with an email and password and their data is saved to **their own private row in your
Supabase project**, available on any device.

Supabase has a free tier that is plenty for personal use. You create the project yourself (it needs your own
account); nothing here can be done for you.

## 1. Create a project

1. Sign up at <https://supabase.com> and click **New project**.
2. Pick a name, a strong database password (store it in a password manager; the app never needs it) and the region
   closest to you (Singapore if you're there).

## 2. Create the table and security rules

1. In the project, open **SQL Editor → New query**.
2. Paste the whole contents of [`migrations/0001_user_data.sql`](migrations/0001_user_data.sql) and click **Run**.
   You should see "Success. No rows returned".

That creates the `user_data` table and turns on **Row Level Security**: every query is limited to the signed-in
user's own row, and signed-out visitors can touch nothing. It also adds the "delete my account" function.
It is safe to run more than once.

## 3. Connect the app

1. On the project page click **Connect** (or open **Settings → API Keys**).
2. Copy the **Project URL** and the **publishable key** (it starts with `sb_publishable_`).
3. In the project folder, copy `.env.example` to `.env.local` and fill in:

   ```
   VITE_SUPABASE_URL=https://<your-project>.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   ```

4. Restart `npm run dev`. You should now see the sign-in screen.

> **Never** use a **secret key** (`sb_secret_…`) or the legacy `service_role` key in this project. Those bypass all
> security. Pace refuses to start with one and says why in Settings → Account. The publishable key is designed to
> be public; Row Level Security (step 2) is what protects the data. `.env.local` is git-ignored.
>
> Older projects may still show a legacy **anon** key (a long string starting `eyJ`). It works too, but Supabase is
> retiring it by the end of 2026, so prefer the publishable key.

## 4. Configure sign-in (Authentication in the dashboard)

- **URL Configuration:** set **Site URL** to where the app runs (`http://localhost:5173` while developing, your real
  address once deployed) and add the same addresses under **Redirect URLs**. The links in confirmation and
  password-reset emails send people back there.
- **Sign In / Providers → Email:** keep **Confirm email** on. Raise the minimum password length to 10 or more.
- **Email delivery (important):** until you set up your own email provider, Supabase's built-in email **only sends to
  members of your Supabase team** and only about **2 emails per hour**. For a personal app that's fine: sign up in
  Pace with **the same email address you use for Supabase**. To let other people sign up, configure custom SMTP
  (Authentication → Emails → SMTP; providers such as Resend, Postmark or Brevo work).
- **Make it only yours (recommended for a personal app):** after creating your own account, switch off
  **Allow new users to sign up** (Sign In / Providers). Nobody else can create an account; you keep signing in as normal.
- Turn on **leaked password protection** if your plan offers it.

## 5. Deploying

**GitHub Pages (set up in this repo):** `.github/workflows/deploy.yml` builds and publishes the site on every push to
`main`, at `https://<owner>.github.io/<repo>/`. It needs, once:

1. **Settings → Pages → Source: GitHub Actions** (free for public repos; private repos need a paid plan).
2. **Settings → Secrets and variables → Actions → Variables:** add `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_PUBLISHABLE_KEY` (the same values as `.env.local`). Leave them out for a local-only site.
3. In Supabase, add the site's address (with the trailing `/`) to **Redirect URLs**, and make it the **Site URL** if
   you want email links to open the live site rather than `localhost`.

**Any other static host** (Netlify, Vercel, Cloudflare Pages): build with `npm run build` and serve `dist/`. Set the
same two variables in the host's environment settings (they are baked in at build time), add the site's address to
the Redirect URLs, and serve it over **HTTPS**. Pace uses `#/` routes, so no rewrite rules are needed. If the site
lives in a sub-folder, build with `BASE_PATH=/folder/`.

Every build refuses to run if the key is a secret key, because everything `VITE_*` is shipped to visitors.

## Trying the screens without Supabase

`npm run dev:mock` swaps Supabase for a pretend backend inside your browser so you can try sign-up, sign-in,
password reset and the "changed on another device" prompt. It is clearly labelled in the UI and is **not secure**;
it only exists in the dev server and is stripped out of production builds.

## How your data is protected

- Passwords are handled entirely by Supabase Auth (hashed, never stored by this app).
- Each person's data is one row keyed to their user id; Row Level Security enforces "only your own row" inside the
  database, not just in the app. Signed-out visitors have no access at all.
- Saves carry a version number. If another device saved first, the app stops and asks which copy to keep instead of overwriting.
- Signing out reloads the page so nothing from the previous session stays in memory.
- Account deletion removes the login and, by cascade, all saved data.

## Limits to know about

- Two devices editing at once are protected from silent overwrites but not merged: you choose one version.
- The whole document is saved on each change, which is fine for personal use (years of transactions) but not for huge datasets.
- The client-side "too many tries" pause on the sign-in form is a courtesy; real rate limiting is enforced by Supabase.
