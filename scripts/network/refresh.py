#!/usr/bin/env python3
"""Refresh data/network.json for the Outlet network and Growth & momentum pages.

Downloads the day-wise target, day-wise sales, last-month (SPLY) and outlet
master workbooks from the outlet-network Google Drive folder into a temporary
folder, then rebuilds network.json. Standard library only.

Exit code 1 = the refresh failed; network.json is left untouched, so the
dashboard keeps showing the last good snapshot.
"""
import os
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent


def main() -> int:
    with tempfile.TemporaryDirectory(prefix="network-") as work:
        os.environ["NETWORK_WORK"] = work
        sys.path.insert(0, str(HERE))
        import build_dashboard_data  # noqa: E402  (reads NETWORK_WORK at import)
        import fetch_drive_data  # noqa: E402

        if fetch_drive_data.main() != 0:
            return 1
        try:
            build_dashboard_data.main()
        except Exception as err:  # noqa: BLE001 - report and keep the last good file
            print(f"::error::Outlet network build failed: {err}", flush=True)
            return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
