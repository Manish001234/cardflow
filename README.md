# CardFlow v1.2.2 — Single-name, brand-name and duplicate-match fix

## Scope
Changed/new files only. Copy contents of `src/` and `tests/` into your existing project, preserving paths.

- `src/lib/contact-parser.ts`: Detect one-word names directly above a job title (e.g., HRITHIK above MANAGER); detect one-word uppercase company brands adjacent to the person's name/job (e.g., INOVARA). This is a conservative heuristic, not a guarantee for every card.
- `src/lib/duplicates.ts`: Do not treat generic inboxes (e.g. hello@, info@) as unique person identifiers. When both names are nonempty and clearly differ, do not treat identical phone/personal email alone as an exact identity match. No automatic merge or deletion.
- `tests/ocr-single-name.test.cjs`: Six additional regression tests.

## Why it failed
Prior parser required >=2 words for `fullName` and recognized companies only by suffix/keyword. Thus `HRITHIK` and `INOVARA` could be discarded despite OCR recognizing them. Matching the shared example email then triggered a misleading strong duplicate match.

## Apply on Windows
1. Back up your current project and export contacts. Do not delete existing data.
2. Copy patch files over the project paths.
3. In PowerShell from project root:

```powershell
npm run test
npm run typecheck
npm run build
npm run dev
```

4. Scan the blue HRITHIK / INOVARA test card. Confirm `fullName=Hrithik`, `jobTitle=MANAGER`, `companyName=INOVARA` **when those words have been recognized by PaddleOCR**.
5. Scan Jaya Prakash and HRITHIK. With shared `hello@reallygreatsite.com` they should not be flagged solely because of that generic email.
6. Verify that existing contacts, MongoDB sync, private Vercel Blob thumbnails, login, export still work. The known broken private-preview issue is **not** fixed here and requires its own investigation.
7. Only after build and browser QA pass:

```powershell
git add src/lib/contact-parser.ts src/lib/duplicates.ts tests/ocr-single-name.test.cjs
git commit -m "Improve single-word OCR names and shared-email duplicate matching"
git push origin main
```

## Verification and limits
- 83/83 available automated tests passed in the patch development environment (existing tests + 6 new tests).
- `npm run typecheck`/Next.js production build **not verified here** because this environment does not contain the project's installed dependencies. Run both in your local working project.
- This is a **parser fix**. It cannot recover letters that the OCR engine never recognized. If `HRITHIK` is still missing after applying, inspect PaddleOCR's raw recognized lines and image-resolution/model quality before claiming parsing is fixed. Do not infer names not present in OCR text.
- The patch does not edit UI, cloud contacts, the paid-provider configuration, or private Blob previews.
