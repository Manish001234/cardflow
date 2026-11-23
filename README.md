# CardFlow Phase 2B — Vercel Private Blob & MongoDB Synchronization

**Apply over the accepted Phase 2A.1 build.** This archive includes only new and modified files. Copy its contents into the CardFlow root and allow overwriting the paths in the archive. Do not delete `.env.local` or MongoDB records. Back up the current source and export contacts before updating.

## Delivered

- Private original-image storage using **Vercel Blob**, direct browser upload, 10 MB JPEG/PNG/WebP allowance and per-account rate limit (30 upload-token requests/minute). Gemini still receives its existing optimized OCR images.
- Original front/back image uploads occur for **new** contacts and after user decisions on duplicates; no images are uploaded while a duplicate is waiting for a decision. Preview URLs resolve through authenticated Next.js handlers; MongoDB contains only private Blob paths, MIME and byte-size metadata.
- Safe image deletion after a confirmed contact delete or image replacement, with retry records for failed deletes; an optional maintenance script cleans abandoned uploads older than 24 hours.
- Optimistic concurrency via integer `revision` on each MongoDB contact. Conflicting updates and deletes return HTTP 409; the browser retains its unsaved changes in the existing account-scoped local backup and displays a conflict message. There is deliberately **no automatic overwrite or silent conflict resolution**.
- Existing UI, login/register, Gemini OCR API, duplicate handling, CSV/Excel, stored records, tags and favorites remain.

## 1. Configure Vercel Blob

1. In **Vercel Project > Storage**, create a Blob store with **Private** access (NOT public) and connect it to CardFlow's project/environment.
2. Enable a **Read/Write token** for client-upload token generation. Use `BLOB_READ_WRITE_TOKEN` in Vercel environment variables (Production / Preview / Development where needed). Vercel may additionally provide `BLOB_STORE_ID` and OIDC. **Never use `NEXT_PUBLIC_` for this secret.**
3. Retain `MONGODB_URI`, `MONGODB_DB`, `GEMINI_API_KEY`, and `GEMINI_MODEL` settings from Phase 2A.
4. Locally, obtain the Vercel env variables using the CLI or copy the server-only token to `.env.local`. Create a separate development Blob store if you want to avoid mixing development and production images.
5. Vercel client upload callbacks cannot reach `localhost`; for *local callback testing*, configure `VERCEL_BLOB_CALLBACK_URL` to a public HTTPS tunnel. A deployed Vercel project does not require a tunnel. The contact API independently validates newly uploaded Blob files with `head()`, so saving contacts does not depend on callback delivery.

## 2. Windows PowerShell

From the existing CardFlow project directory:

```powershell
# After copying the changed/new files into the project:
npm install
npm run test
npm run typecheck
npm run lint
npm run build
npm run dev
```

Open `http://localhost:3000`. **Do not commit `.env.local`.**

## 3. Vercel deploy

Use the existing Vercel project. Configure the environment variables under **Project Settings > Environment Variables**, link your Private Blob store and deploy from the repo. No new Vercel project or separate API service is required. Keep Next.js Route Handlers on the Node.js runtime. Test on a real deployment to verify upload callbacks and authenticated image streaming.

## 4. Manual acceptance testing

1. Log in; verify existing contacts load unchanged and all dashboard sections still work.
2. Scan a new single image; confirm OCR works, contact persists, and original image preview still displays after refresh and from another browser signed into the same account.
3. Scan a front+back card; verify both sides in Contacts drawer after refresh.
4. Scan an existing card; verify no duplicate is silently saved. Merge, Replace, Keep Both and Discard should each leave the processing queue in the correct state, with image uploads only after a save action.
5. Create a second user; confirm it cannot retrieve the first user's `/api/cards/{id}/image/front` URL (404 or 401).
6. Open two browsers using the same account; edit the same existing contact separately, save one, and verify the second receives a conflict warning. Export local changes before reloading; there is no automatic last-write-wins overwrite.
7. Delete a saved contact, reload, and ensure both contact and associated images are inaccessible. On a failed Blob delete, a `blob_cleanup` queue entry remains for the maintenance script.
8. Try over-limit image uploads, invalid MIME files, and direct unauthenticated upload requests; verify rejection.
9. Confirm CSV/Excel exports and imports, favorites, tags, filtering, OCR and review history remain functional.
10. Verify MongoDB `contacts` documents now carry `revision` and `images` metadata; verify no private Blob URL is exposed as a public link.

## 5. Maintenance

To remove **unreferenced** Blob files recorded by callbacks more than 24 hours ago and retry recorded failed deletes:

```powershell
node --env-file=.env.local scripts/reconcile-blobs.mjs
```

Run periodically from an administrator environment. This utility requires the MongoDB connection and `BLOB_READ_WRITE_TOKEN`. It checks every candidate against live MongoDB contact references before deletion. Keep a backup and test against a development store first. No cron schedule is created by this patch.

## 6. Compatibility / known boundaries

- Existing images in MongoDB remain as the legacy compressed preview until the card is rescanned or its originals are uploaded in a later migration. **There is no automatic re-upload of legacy browser images**.
- The scan-review queue still persists text/preview data in browser storage. If a duplicate review is resumed after refresh, the original `File` objects cannot be recovered and only the compressed preview is available for that old queue item; re-scan the card to persist a full-size original.
- Blob orphan cleanup is eventual, not a MongoDB/Blob distributed transaction. A failed upload or interrupted browser can temporarily leave an unreferenced blob; use the maintenance script.
- A 409 conflict stops synchronization; export unsaved local changes as a backup, reload latest MongoDB records, then reapply relevant edits manually.
- The 55 tests cover pure helpers and contract checks, not a live Blob store, database transactions or an end-to-end deployed Vercel run. Execute the manual checks above before marking Phase 2B accepted for production.

## Unchanged core

`/api/extract-card` remains your accepted Gemini integration; `.env.local` secrets are unchanged; existing user accounts, auth flow, visual dashboard, and data collection names are preserved.
