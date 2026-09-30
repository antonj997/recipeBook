# Recipebook backend

Project: `qlveyumspzdlscsgudex` — `https://qlveyumspzdlscsgudex.supabase.co`

Recipes and collections belong to the signed-in user. Every exposed table has an ownership policy. Photos live in a private Storage bucket. The browser only receives the project URL and a **publishable** key; a service-role or secret key must never be included in the app.

Dexie remains the offline cache. Each account gets a separate database; the original `RecipebookDB` stays intact. Use **Settings → Copy to my account** after signing in to copy the original cookbook to an account. Copying skips existing IDs and does not remove the device copy. Downloads and backup imports still include photos.

Edits are saved locally with an outbox entry in the same transaction. Reconnect or use **Sync now** to upload them and fetch the cloud cookbook. Changing an item on two devices uses the last successful upload; this is not collaborative editing. Deletion markers tell other devices which cached items to remove. Signing out returns to the original device cookbook; pending account edits remain in that account's cache until it signs in again.

## Deploy the backend

The initial migration and Edge Function were deployed through the signed-in dashboard on September 30, 2026. Migration `20260930070934` is recorded in `supabase_migrations.schema_migrations`, so future CLI pushes skip it. Dashboard deployment uses the same shared parser files, with sibling import paths and a pinned Cheerio import to fit the browser editor; CLI deployment uses the repository paths directly.

Use the official Supabase CLI, pinned here to `2.118.0`. Authenticate locally; never paste an access token or database password into chat or commit it.

```powershell
npx.cmd --yes supabase@2.118.0 login
npx.cmd --yes supabase@2.118.0 link --project-ref qlveyumspzdlscsgudex
npx.cmd --yes supabase@2.118.0 db push
npx.cmd --yes supabase@2.118.0 config diff --project-ref qlveyumspzdlscsgudex
npx.cmd --yes supabase@2.118.0 config push --project-ref qlveyumspzdlscsgudex
npx.cmd --yes supabase@2.118.0 functions deploy import-recipe --project-ref qlveyumspzdlscsgudex --use-api
npx.cmd --yes supabase@2.118.0 db advisors --project-ref qlveyumspzdlscsgudex
```

The migration adds recipes, collections, private image policies, and an atomic import quota. Recipebook supports in-app account creation and email/password sign-in. The minimum password length is eight characters, with no required character combinations. Supabase hashes passwords; Recipebook does not store passwords in its own database or backups. Apply the Auth configuration to the hosted project as well as committing it locally.

Email confirmation stays enabled. **Forgot password?** sends a recovery link that opens a new-password form; the app initializer consumes the callback before hash routing. Password-change protection requires a recent authenticated session. Recovery changes the password on the existing account and leaves cookbook ownership intact. Password recovery remains necessary for ordinary password accounts; there is no separate migration flow for earlier email-only accounts.

The default sender is retained. It only delivers to project team addresses and currently permits two emails per hour. Everyday password sign-in does not send email, but confirmation and recovery still depend on email delivery. Configure custom SMTP before inviting friends outside the project team; do not disable email confirmation to bypass delivery limits.

Signing out waits for the current synchronization attempt and warns when changes remain queued. Queued changes and account caches are retained. A successful sync status is only shown after a complete upload/download cycle succeeds.

## Configure the app and Pages

Set `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` as GitHub repository **variables**. The build generates `public/supabase-config.json`, which is ignored by Git and included in the deployed app. `scripts/configure-supabase.mjs` rejects secret and legacy service-role keys.

For local development, set the same environment variables before `npm.cmd run dev` or `npm.cmd run build`. If neither is provided, a previously generated local configuration is preserved; otherwise the app runs with the original device storage and local importer.

## Importer

The Edge Function verifies the user, enforces 30 recipe imports and 150 photo requests per account per hour, and only fetches approved HTTPS hosts. Requests, downloads, and execution have bounds; redirects are rejected. Browser origins are limited to the published app and local development. A photo fallback handles approved image CDNs when browser CORS prevents direct downloads.

The hosted function and Express server share the same parser and metadata extraction. Author, ratings, difficulty, separate prep/cook times, and cooking tips remain excluded. Recipes still open in the unsaved review flow before **looks good!** writes them.

Private files use content hashes to avoid duplicate uploads. Unreferenced photos are retained, rather than deleting files that another offline device may still need; a future cleanup process can reclaim them. Account caches are stored on the device, so use a trusted browser profile.

## Verification

Run `npm.cmd run build`, the Pages build, and Deno's type check for `supabase/functions/import-recipe/index.ts`. Verify ownership with two users, offline edits/reconnect, sign-out/account switching, photos, and a real recipe import after deployment. No `.spec.ts` or automated tests were added.
