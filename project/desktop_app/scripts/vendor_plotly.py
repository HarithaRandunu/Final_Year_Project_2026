"""One-time asset step (Milestone 0): copies the Plotly.js bundle already
shipped inside the `plotly` pip package into frontend/vendor/, so the desktop
app's frontend can <script src="/vendor/plotly.min.js"> it without depending
on `plotly` being importable at runtime or on any CDN (the app must work
fully offline). Re-run this after bumping the pinned `plotly` version in
requirements.txt.
"""
from pathlib import Path

import plotly.offline as pyo

VENDOR_DIR = Path(__file__).resolve().parent.parent / "frontend" / "vendor"


def main() -> None:
    VENDOR_DIR.mkdir(parents=True, exist_ok=True)
    js = pyo.get_plotlyjs()
    out_path = VENDOR_DIR / "plotly.min.js"
    out_path.write_text(js, encoding="utf-8")
    print(f"Wrote {out_path} ({len(js) / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
