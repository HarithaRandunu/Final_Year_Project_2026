"""
Shared categorical color assignment for the Phase 8 dashboard (Full_Plan.md
Section 13). One fixed mapping used everywhere an arm/module appears, so
identity is never re-cycled or re-colored between pages or charts.

Palette slots 1-5 of the dataviz skill's validated 8-hue categorical order,
run through scripts/validate_palette.js for this exact 5-color subset:
all hard gates (lightness band, chroma floor, CVD adjacent separation,
normal-vision floor) pass. Three slots (aqua, yellow, magenta) fall below
3:1 contrast against a white surface - the "relief rule" applies, so every
chart using these colors also carries a direct label (never color alone)
and a raw-data table is shown alongside.
"""

ARM_ORDER = ["baseline", "m1_only", "m2_only", "m3_only", "full"]

ARM_COLORS = {
    "baseline": "#2a78d6",   # slot 1, blue
    "m1_only": "#eb6834",    # slot 2, orange
    "m2_only": "#1baf7a",    # slot 3, aqua
    "m3_only": "#eda100",    # slot 4, yellow
    "full": "#e87ba4",       # slot 5, magenta
}

ARM_LABELS = {
    "baseline": "Baseline (HPA)",
    "m1_only": "M1 only (Signal Fusion)",
    "m2_only": "M2 only (Co-Scheduling)",
    "m3_only": "M3 only (Adaptive Control)",
    "full": "Full (M1+M2+M3)",
}

TEXT_PRIMARY = "#0b0b0b"
TEXT_SECONDARY = "#52514e"
GRIDLINE = "#e1e0d9"
