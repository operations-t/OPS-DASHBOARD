#!/usr/bin/env python3
"""Refresh data/cw.json for the Consumable & wastage pages.

Reads two public Google Drive folders (sub-folders included):

* Consumable & Wastage Control — the CONSUMABLE and WASTAGE SAP exports,
  Sales-Till and the target file;
* Performance — the Zone Distribution outlet master (shared with the rest of
  the dashboard, so it lives in one place).

Every file is recognised by its STRUCTURE, never by its name:

* SAP movement export — a Posting Date + Plant + Amount header. Movement type
  551 (write-off) is wastage; Z21/Z22 (consumable issue / reversal) is
  consumable. If the movement type is unfamiliar, material codes starting 60
  (consumable stores) decide.
* Sales — Outlet Code + Date + Division + POS NSI.
* Zone Distribution — CODE + Outlet Name + Format + Division + District +
  PNP Non PNP status + Status.
* Targets — a Final Criteria column with the three target % columns.

When two files of the same kind are found, the one whose data runs latest
wins (Zone Distribution: the most recently modified in Drive).

Exit code 1 = the refresh failed; cw.json is left untouched, so the dashboard
keeps showing the last good data.
"""
import csv
import io
import json
import os
import re
import sys
import tempfile
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent / "network"))

import build_data as bd  # noqa: E402
import fetch_drive_data as drive  # noqa: E402  (stdlib public-folder listing and download)
from openpyxl import load_workbook  # noqa: E402

CW_FOLDER = (os.environ.get("CW_FOLDER_ID") or "1FLbOzMJnihnXWO6hfSJeI5vJ1VFSI1RD").strip()
ZONE_FOLDER = (os.environ.get("ZONE_FOLDER_ID") or "1r09IGv8Pk0J86li4hqLD8gskj5j3SBih").strip()
OUT = Path(os.environ.get("CW_OUT") or ROOT / "data" / "cw.json")
DATA_SUFFIXES = (".xlsx", ".xlsm", ".xls", ".txt", ".csv", ".tsv")
WASTAGE_MOVES = {"551", "552"}
CONSUMABLE_MOVES = {"Z21", "Z22", "201", "202"}
SALES_HEADERS = {"outlet code", "date", "division", "pos nsi"}
ZONE_HEADERS = {"code", "outlet name", "format", "division", "district", "pnp non pnp status", "status"}
TARGET_HEADERS = {"final criteria", *(h.casefold() for h in bd.TARGET_COLUMNS.values())}


def log(msg):
    print(msg, flush=True)


def norm(v):
    return bd.clean_text(v).casefold()


def sap_kind(path):
    """'consumable' / 'wastage' plus the latest posting date, or None if this is not a SAP export."""
    columns, moves, prefixes, latest = None, Counter(), Counter(), None
    try:
        for n, row in enumerate(bd.iter_sap_rows(path)):
            cells = [bd.clean_text(c) for c in row]
            if columns is None:
                if n >= 200:
                    return None
                columns = bd.locate_sap_header(cells)
                continue
            get = lambda f: cells[columns[f]] if f in columns and columns[f] < len(cells) else ""  # noqa: E731
            if not bd.normalize_outlet_code(get("plant")):
                continue
            moves[get("movement").upper()] += 1
            prefixes[get("material")[:2]] += 1
            d = bd.parse_date(get("postingDate"))
            if d and (latest is None or d > latest):
                latest = d
    except Exception:  # noqa: BLE001 - unreadable file is simply "not a SAP export"
        return None
    if columns is None or not moves:
        return None
    w = sum(c for m, c in moves.items() if m in WASTAGE_MOVES)
    c = sum(c for m, c in moves.items() if m in CONSUMABLE_MOVES)
    if w or c:
        return ("wastage" if w >= c else "consumable"), latest
    return ("consumable" if prefixes.get("60", 0) > sum(prefixes.values()) / 2 else "wastage"), latest


def sheet_headers(path, rows=15):
    """Yield (sheet, row index, normalised header set) for the first rows of every sheet."""
    wb = load_workbook(io.BytesIO(path.read_bytes()), read_only=True, data_only=True)
    try:
        for ws in wb.worksheets:
            for i, row in enumerate(ws.iter_rows(values_only=True, max_row=rows)):
                yield ws, i, {norm(v) for v in row if v not in (None, "")}
    finally:
        wb.close()


def table_kind(path):
    """'sales' / 'zones' / 'targets' for an Excel or text table, with a freshness value."""
    data = path.read_bytes()
    if data[:4] == b"PK\x03\x04":
        for ws, i, heads in sheet_headers(path):
            if SALES_HEADERS <= heads:
                return "sales", sales_latest(path)
            if ZONE_HEADERS <= heads:
                return "zones", None
            if TARGET_HEADERS <= heads:
                return "targets", None
        return None
    # Text: the target file is tab-delimited; look at its first line.
    text = data[:4096].decode("utf-8-sig", errors="replace")
    first = text.splitlines()[0] if text else ""
    heads = {norm(h) for h in re.split(r"[\t,;|]", first)}
    return ("targets", None) if TARGET_HEADERS <= heads else None


def sales_latest(path):
    wb = load_workbook(io.BytesIO(path.read_bytes()), read_only=True, data_only=True)
    try:
        ws = wb["Comparative"] if "Comparative" in wb.sheetnames else wb.worksheets[0]
        rows = ws.iter_rows(values_only=True)
        idx = {norm(v): i for i, v in enumerate(next(rows))}.get("date")
        latest = None
        for r in rows:
            d = bd.parse_date(r[idx]) if idx is not None and idx < len(r) else None
            if d and (latest is None or d > latest):
                latest = d
        return latest
    finally:
        wb.close()


def main():
    drive.MAX_DEPTH = 3
    with tempfile.TemporaryDirectory(prefix="cw-") as work:
        work = Path(work)
        found = {k: [] for k in ("consumable", "wastage", "sales", "zones", "targets")}
        for label, folder, kinds in (("Consumable & Wastage Control", CW_FOLDER, {"consumable", "wastage", "sales", "targets"}),
                                     ("Performance (Zone Distribution)", ZONE_FOLDER, {"zones"})):
            log(f"Listing {label} folder {folder}…")
            try:
                items = drive.walk(folder)
            except RuntimeError as err:
                log(f"::error::{err}")
                return 1
            for n, item in enumerate(items):
                if not (item["name"].lower().endswith(DATA_SUFFIXES) or item["mimeType"] == drive.GSHEET_MIME):
                    continue
                suffix = Path(item["name"]).suffix.lower() or ".xlsx"
                dest = work / f"{label[:2]}{n}{suffix}"
                try:
                    dest.write_bytes(drive.fetch_bytes(item))
                except RuntimeError as err:
                    log(f"::warning::{err}")
                    continue
                sap_possible = "consumable" in kinds and (suffix != ".txt" or dest.stat().st_size > 20000)
                kind = sap_kind(dest) if sap_possible else None
                kind = kind or table_kind(dest)
                if not kind or kind[0] not in kinds:
                    log(f"  skip  {item['path']}  (not a {'/'.join(sorted(kinds))} layout)")
                    dest.unlink()
                    continue
                # Keep the Drive name (bd reports it on the Data quality page) inside a per-file folder.
                named = work / f"f{n}{label[:2]}" / item["name"]
                named.parent.mkdir()
                dest.rename(named)
                found[kind[0]].append((kind[1], drive.modified_sort_key(item), named))
                log(f"  found {item['path']}  →  {kind[0]}" + (f" (data to {kind[1]})" if kind[1] else ""))
        missing = [k for k, v in found.items() if not v]
        if missing:
            log(f"::error::No {', '.join(missing)} file recognised in the Drive folders.")
            return 1
        files = {}
        for kind, options in found.items():
            options.sort(key=lambda o: (o[0] or bd.dt.date.min, o[1]), reverse=True)
            if len(options) > 1:
                log(f"::warning::{len(options)} {kind} files found; using {options[0][2].name}.")
            files[kind] = options[0][2]
        try:
            payload = bd.build_dashboard_data(work, files)
        except Exception as err:  # noqa: BLE001 - report and keep the last good file
            log(f"::error::Consumable & wastage build failed: {err}")
            return 1
    OUT.parent.mkdir(parents=True, exist_ok=True)
    tmp = OUT.with_suffix(".tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":"), allow_nan=False), encoding="utf-8")
    os.replace(tmp, OUT)
    al = payload["dataQuality"].get("periodAlignment") or {}
    log(f"Wrote {OUT}: {len(payload['outlets'])} outlets, {len(payload['daily'])} outlet-days, "
        f"{payload['dateRange']['min']} to {payload['dateRange']['max']}.")
    if not al.get("aligned"):
        log(f"::warning::Source periods differ: " + ", ".join(f"{k} {v['dateMin']}–{v['dateMax']}" for k, v in (al.get("sources") or {}).items()))
    return 0


if __name__ == "__main__":
    sys.exit(main())
