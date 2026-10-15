# Ink & Issue v0.1

**Every issue. Every cover. Every era.**

An online-first comic catalog and collection app for iOS and Android, designed for an iPhone-only development workflow.

## Included in this milestone

- React Native / Expo starter project.
- Dark mobile interface branded as Ink & Issue.
- Catalog and My Collection screens.
- SQLite database persisted on-device.
- Issue records with plot summaries.
- Separate variant-cover records linked to each issue.
- Local add/remove collection workflow.
- Remote cover-image URL fields; cover images are not bundled in the app.
- Draft Supabase schema with image-source metadata and per-user row-level security.
- GitHub Actions workflow to validate an Android export.

## Important current limitations

- The catalog is fictional demo data only. Do not treat the demo issue as a real comic.
- No production historical catalog has been imported yet.
- No real cover images are included. When a legitimately reusable image is available, later catalog ingestion should populate `image_url`, `image_source_url`, `image_attribution`, and `image_license`.
- Plot summaries must come from sources whose terms permit the intended reuse, or be entered with appropriate rights. Keep source metadata for traceability.
- Supabase sync, authentication, scheduled release imports, barcode scanning, and production search are not yet implemented.
- This is a starter milestone, not a release-ready public app.

## iPhone-first repository setup

1. Create a GitHub repository named `ink-and-issue`.
2. Extract the provided ZIP and upload the **contents** of this folder to the repository root, preserving the `.github/workflows` folder. Do not upload the ZIP itself.
3. Use a browser-based Expo workflow to preview/test. If using Expo Snack, create a project and copy `App.js`, `app.json`, and dependencies from `package.json`.
4. For repository-based validation, run `npm install` and `npm run check` in a compatible build environment.
5. Test: open Catalog, open the demo issue, select Cover A or B, add it, open My Collection, remove one copy, and restart the app to confirm persistence.

## Database and image principles

- Cloud catalog is the eventual source of truth.
- SQLite stores the user's collection and a small cache, not the entire catalog.
- Cover images should be remotely hosted or served from an authorized image source; do not package the full cover library in the app.
- Use remote image URLs only when image hosting/embedding is authorized. Store attribution, source URL, and license information.
- Prefer small thumbnails from an authorized image source to keep the app lightweight.
- If a cover image is unavailable or cannot legally be displayed, show a fallback and mark the record as missing/restricted rather than copying it without permission.
- Treat plot summaries as sourced data, not automatically reusable text. Record source metadata and license/permission details.

## Planned next milestones

1. Connect Supabase and add authentication plus collection sync.
2. Build catalog import tooling with stable external IDs, deduplication, and source provenance.
3. Import a small historical sample after reviewing licensing.
4. Integrate a permitted release-list source and scheduled incremental updates.
5. Expand publisher coverage, cover-image availability, and plot-summary coverage.
