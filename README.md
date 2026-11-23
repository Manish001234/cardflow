# CardFlow Phase 2D.1 — Vercel TypeScript Build Fix

## Issue
Vercel build fails in `src/app/api/blob/upload/route.ts` at line 25: MongoDB `findOneAndUpdate` rejects a string `_id` because untyped collections default to MongoDB `ObjectId`.

## Minimal change
Only `src/app/api/blob/upload/route.ts` is modified. A `BlobUploadLimit` TypeScript type explicitly declares `_id: string`, `count: number`, and `expiresAt: Date`, and the collection call uses `collection<BlobUploadLimit>`. No runtime behavior, routes, auth, Gemini, existing data, or UI is changed.

## Windows steps
1. Extract this ZIP into your CardFlow project root. Replace the single file at the same relative path.
2. Run:
   ```powershell
   npm run typecheck
   npm run test
   npm run build
   git add src/app/api/blob/upload/route.ts
   git commit -m "Fix MongoDB upload rate limit TypeScript type"
   git push origin main
   ```
3. Vercel automatically builds the new GitHub commit. Inspect the build log for any other errors.

## Validation
Reviewed the error and source and exercised inherited Node regression tests. A full TypeScript/Next.js build cannot be verified in this environment because project node_modules are unavailable. Do not claim deployment is successful until Vercel confirms.
