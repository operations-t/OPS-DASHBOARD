# Operations Dashboard

Sales achievement and growth visibility for Shwapno operations, fed automatically from four Google Drive folders.

## How the data gets in

GitHub downloads the files from the public Drive folders every hour (8 am to 11 pm Dhaka time), reads them by their content, and saves `data/data.json`. The site only reads that file. No API key is used.

| Drive folder | What goes in it | Rule |
|---|---|---|
| Till-date | Daily till-date Business Performance Report | Replace the file each day |
| Month-end | Last month's closed Business Performance Report | Replace the file each month |
| Performance | KPI RHO & Zonal file, Zone Distribution and Outlet-wise Profitability (P&L) | Add new files each month, keep old ones |

Filenames don't matter. Every folder must stay shared as "Anyone with the link", and each folder can hold at most 50 files.

If a file is broken or missing, the refresh is rejected and the site keeps the last good data. The Data quality page lists every problem found.

### The mother Drive folder

All data now lives under one mother folder, [Operations data](https://drive.google.com/drive/folders/1Te9stxbcBsIIO8bNElPuDXXPovkk4v1l), shared as "Anyone with the link". The Outlet network, Growth & momentum and Consumable & wastage refreshes search every sub-folder of it and recognise each file by its columns, never by its name. The main sales pages still read the Daily, Month-end and Performance sub-folders by their links, so keep those three folders.

One till-date sales file (columns **Outlet, Date, Article Division, POS NSI**) feeds both the Outlet network pages and Consumable & wastage; keep it current. If two files of the same kind exist, the one whose data runs latest wins (for Zone Distribution, the most recently modified).

### Outlet network and Growth & momentum

These two pages are built into this dashboard and read `data/network.json`, which the same hourly refresh builds from the mother folder. It needs these workbooks, anywhere under it:

| Workbook | How it is recognised | Required |
|---|---|---|
| Outlet master / Zone Distribution | `CODE` + `Outlet Name` header with `Leader` / `Zonal` / `Format` columns | yes |
| Day-wise target | `Outlet Code` + `Outlet Name` header followed by daily date columns | yes |
| Day-wise sales | the till-date sales file: `Outlet` (or `Outlet Code`) + `Date` + `POS NSI`, divisions are summed | yes |
| Last month (SPLY) | a Business Performance Report whose `SPLY-ALL (…)` period is the month before the target month (the month-end report) | optional |

Without a last-month workbook every last-month figure shows as —. The month-end projection is actual sales to date plus separate average-sales forecasts for the remaining Fridays, Saturdays and Sunday–Thursday days, and month-on-month growth is measured only on outlets that have a last-month figure. A failed network refresh never blocks `data.json`; the pages keep the last good `network.json`.

## First-time setup on GitHub

1. Create a new repository (public for testing) and upload everything in this folder, including the `.github` folder.
2. Settings → Actions → General → Workflow permissions: choose **Read and write permissions** and save.
3. Settings → Pages → Build and deployment: Source **Deploy from a branch**, branch **main**, folder **/ (root)**, then save.
4. Actions → **Refresh data** → **Run workflow**. When it finishes (about a minute), the site shows the latest Drive files.

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
- `scripts/network/refresh.py` — downloads the outlet network folder and builds `data/network.json` (standard library only)
- `scripts/cw/refresh.py` — downloads the Consumable & Wastage Control folder (Target.txt, Sales-Till, Zone Distribution, CONSUMABLE, WASTAGE) and builds `data/cw.json`
- `.github/workflows/refresh-data.yml` — the hourly refresh
- `data/data.json`, `data/network.json`, `data/network-sync.json`, `data/cw.json` — generated data (don't edit by hand)
- `Dockerfile`, `deploy/` — Coolify / Docker packaging (nginx + hourly refresh + optional login)
