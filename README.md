# Operations Dashboard

Sales achievement and growth visibility for Shwapno operations, fed automatically from three Google Drive folders.

## How the data gets in

GitHub downloads the files from the three public Drive folders every hour (8 am to 11 pm Dhaka time), reads them by their content, and saves `data/data.json`. The site only reads that file. No API key is used.

| Drive folder | What goes in it | Rule |
|---|---|---|
| Till-date | Daily till-date Business Performance Report | Replace the file each day |
| Month-end | Last month's closed Business Performance Report | Replace the file each month |
| Performance | KPI RHO & Zonal file and Zone Distribution | Add new files each month, keep old ones |

Filenames don't matter. Every folder must stay shared as "Anyone with the link", and each folder can hold at most 50 files.

If a file is broken or missing, the refresh is rejected and the site keeps the last good data. The Data quality page lists every problem found.

## First-time setup on GitHub

1. Create a new repository (public for testing) and upload everything in this folder, including the `.github` folder.
2. Settings → Pages → Build and deployment: choose **GitHub Actions** as the source.
3. Actions → **Deploy dashboard** → **Run workflow** to publish the included data snapshot. Future website changes pushed to `main` deploy automatically.
4. Actions → **Refresh data** → **Run workflow** to download the latest Drive files. Every successful refresh starts **Deploy dashboard**, which publishes the saved snapshot. The workflows declare their required permissions; changing the repository's default workflow permissions is not necessary.

Live dashboard: https://operations-t.github.io/OPS-DASHBOARD/

The dedicated deployment workflow is required because commits created with GitHub's built-in workflow token do not trigger a branch-based Pages build. The refresh schedule remains hourly from 8 am to 11 pm Dhaka time; GitHub may delay scheduled runs.

## Deploy on Coolify (private)

The same repository deploys to Coolify with the included `Dockerfile`. The container serves the site and downloads the Drive files itself every hour, so it doesn't depend on GitHub Actions.

1. In Coolify: **New resource → Application**, pick the GitHub repository (public or private).
2. Build pack: **Dockerfile**. Port: **80**.
3. Environment variables (optional):
   - `BASIC_AUTH_USER` and `BASIC_AUTH_PASSWORD` put a login on the whole site. Leave them empty for no login.
   - `REFRESH_MINUTES` sets how often Drive is checked (default 60).
4. Add your domain, then **Deploy**. The first refresh runs as soon as the container starts.

On the Coolify copy, the GitHub "Refresh data" workflow isn't needed. If Coolify redeploys on every push, disable that workflow (Actions → Refresh data → ⋯ → Disable workflow) so it doesn't trigger a redeploy every hour.

## Refresh straight away

GitHub Pages: after uploading a file to Drive, go to Actions → Refresh data → Run workflow.
Coolify: press **Restart** on the application; the refresh runs at start-up.

## Files

- `index.html`, `assets/` — the site
- `scripts/build_data.py` — downloads and reads the Drive files (run `python scripts/build_data.py --local <folder>` to test with local copies in `tilldate/`, `monthend/`, `performance/` subfolders)
- `.github/workflows/refresh-data.yml` — the hourly refresh
- `.github/workflows/deploy-pages.yml` — publishes the website after pushes and successful refreshes
- `data/data.json` — generated data (don't edit by hand)
- `Dockerfile`, `deploy/` — Coolify / Docker packaging (nginx + hourly refresh + optional login)
