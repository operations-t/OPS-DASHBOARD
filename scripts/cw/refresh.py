#!/usr/bin/env python3
"""Refresh data/cw.json for the Consumable & wastage pages.

Downloads the Consumable & Wastage Control Drive folder (Target.txt, Sales-Till,
Zone Distribution, CONSUMABLE and WASTAGE exports) into a temporary folder,
then runs build_data.py on it. Sub-folders are searched too, so the files can
sit anywhere under the folder.

Exit code 1 = the refresh failed; cw.json is left untouched, so the dashboard
keeps showing the last good data.
"""
import json
import os
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent / "network"))

import build_data  # noqa: E402
import fetch_drive_data as drive  # noqa: E402  (stdlib public-folder listing and download)

FOLDER_ID = (os.environ.get("CW_FOLDER_ID") or "1FLbOzMJnihnXWO6hfSJeI5vJ1VFSI1RD").strip()
OUT = Path(os.environ.get("CW_OUT") or ROOT / "data" / "cw.json")


def main() -> int:
    drive.MAX_DEPTH = 3
    with tempfile.TemporaryDirectory(prefix="cw-") as work:
        work = Path(work)
        print(f"Listing Google Drive folder {FOLDER_ID}…", flush=True)
        try:
            items = drive.walk(FOLDER_ID)
        except RuntimeError as err:
            print(f"::error::{err}", flush=True)
            return 1
        for item in items:
            dest = work / item["path"]
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.touch()  # source_file_kind() only classifies files that exist
            if not build_data.source_file_kind(dest):
                dest.unlink()  # not one of the five inputs, so don't download it
                continue
            try:
                dest.write_bytes(drive.fetch_bytes(item))
                print(f"  got   {item['path']}", flush=True)
            except RuntimeError as err:
                print(f"::warning::{err}", flush=True)
        try:
            payload = build_data.build_dashboard_data(work)
        except Exception as err:  # noqa: BLE001 - report and keep the last good file
            print(f"::error::Consumable & wastage build failed: {err}", flush=True)
            return 1
    OUT.parent.mkdir(parents=True, exist_ok=True)
    tmp = OUT.with_suffix(".tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":"), allow_nan=False), encoding="utf-8")
    os.replace(tmp, OUT)
    print(f"Wrote {OUT}: {len(payload['outlets'])} outlets, {len(payload['daily'])} outlet-days, "
          f"{payload['dateRange']['min']} to {payload['dateRange']['max']}.", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
