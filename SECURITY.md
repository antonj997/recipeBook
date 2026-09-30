# Security and privacy

Recipebook is a static Angular application on GitHub Pages, with Supabase Auth, private database rows and private photo storage. Dexie keeps the original device cookbook and separate offline copies for signed-in accounts.

## Security boundaries

- The public connection file contains only the project URL and publishable key. Never put a secret key, service-role key, database password or access token in frontend files, GitHub variables used by the frontend build, backups or commits.
- Database policies authorize every recipe and collection using `auth.uid() = user_id`, including the new owner on updates. Browser state is never the server's authorization boundary.
- Private photos require the same owner folder for reads, inserts and updates. The importer independently verifies the user's JWT, refuses anonymous users, checks origin and approved HTTPS hosts, refuses redirects, bounds request and download sizes, and applies per-account rate limits.
- Account changes invalidate the active view, drafts, pending UI operations and sync results. Work already started against a captured account database stays associated with that database. It cannot be redirected to the next account.
- Supabase manages persistent login sessions and refresh tokens. The SDK consumes email callback tokens before hash routing. The app stores only ID/email in its separate offline identity hint; this hint selects a local cache and does not authorize any server request.
- Production uses Angular AOT, escaped templates, a Content Security Policy and Trusted Types where supported. The only custom Trusted Types policy accepts the exact service-worker script URL. No executable inline scripts or `unsafe-eval` are allowed. Inline styles remain enabled because static-hosted Angular inserts component styles. Critical CSS inlining is disabled to avoid inline script handlers.
- Recipebook does not initialize inside an iframe. GitHub Pages does not offer custom response headers; a host supporting HTTP `frame-ancestors`, HSTS and other security headers would provide stronger deployment control.
- No analytics or third-party scripts are included. Referrers are suppressed. Imported photos use the authenticated approved proxy when configured and become local JPEG copies. Legacy remote step photos require an explicit action; arbitrary remote images are blocked by CSP.

## Offline data and deletion

Signing out removes the active local login, clears the offline identity hint and discards the active review draft. It **does not erase the account's Dexie cookbook or unsynced changes**. This prevents accidental loss while offline. Local copies are not encrypted and remain accessible to someone with access to the browser profile or other code running on the same origin. On a shared device, sync or export first, sign out, then clear Recipebook's site data using the browser's settings. Clearing site data also removes the original device cookbook, drafts and queued offline work.

Deleting a recipe removes its fields from the cloud row after synchronization and leaves a tombstone to prevent an offline device from resurrecting it. A device retains its old copy until it synchronizes. **Unreferenced private photo objects are currently retained**; automatic reference-aware cleanup has not been implemented. Do not treat deleting a recipe as complete erasure of all historical photos. Do not delete Storage rows directly in SQL: the Storage API must remove the actual objects. Account erasure would also require session revocation and Storage cleanup, rather than only deleting the Auth user.

All projects on `antonj997.github.io` share a browser origin. Service-worker scope limits which paths the worker controls, but does not isolate login storage or Dexie from another site on that origin. Keep other repositories on that origin trusted; use a dedicated domain if untrusted applications will share the account.

## PWA

The web manifest uses paths relative to the deployment directory and includes regular, maskable and Apple home-screen icons. Installation uses the browser's native Install app / Add to Home Screen flow. The app worker prefetches only local app files, including lazy pages. It does not cache Supabase requests, private photos, the public connection endpoint or callback responses. Recipe data remains in the existing Dexie stores. A public configuration copy is retained separately for offline startup.

Updates download in the background and are applied on a full reload. The user chooses Reload; the existing unsaved-work warning remains active. Offline sign-in, link import and uploading changes still require an internet connection. The screen-awake switch is per recipe view, off by default, and hidden when the browser API is unavailable. It releases on route exit and reacts to browser lock release and visibility changes; the browser can deny it to save battery.

## Verification and limits

The September 30, 2026 review found and fixed stale account views/actions, unscoped drafts, stale backup operations and synchronization state, and automatic remote image loading. Live ownership, cross-account denial, update-owner protection, private bucket and importer quota checks passed in a rolled-back transaction. Production dependencies had zero reported vulnerabilities at the time of review. Builds and manual browser checks are recorded separately.

No audit can guarantee absolute security. A real signed-in, cross-device flow remains unverified because the user was unavailable and the default email sender was rate limited. The default sender is intentionally retained at the user's request; it permits only project team addresses and currently two emails per hour. Production email delivery to other people requires a custom sender. General public signups would also need an abuse/resource-quota review: current limits bound each photo and importer requests, but do not impose a total cookbook/storage quota per account.

When moving to a different Supabase project or image host, update the exact CSP connection allowlist as well as configuration and the approved photo-host lists. Review Auth redirect URLs, RLS, Storage permissions, session revocation and dependency advisories after deployment changes.
