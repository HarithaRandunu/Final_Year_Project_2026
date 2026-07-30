"""Exact copy of project/dashboard/colors.py's arm color/label assignment -
kept self-contained (not a cross-directory import) so this desktop app's own
venv never depends on the Streamlit dashboard being installed/present, same
reasoning project/live_cluster's controllers already use for their own
self-contained copies (see e.g. module3_controller/app.py's docstring).
"""

ARM_ORDER = ["baseline", "m1_only", "m2_only", "m3_only", "full"]

ARM_COLORS = {
    "baseline": "#2a78d6",
    "m1_only": "#eb6834",
    "m2_only": "#1baf7a",
    "m3_only": "#eda100",
    "full": "#e87ba4",
}

ARM_LABELS = {
    "baseline": "Baseline (HPA)",
    "m1_only": "M1 only (Signal Fusion)",
    "m2_only": "M2 only (Co-Scheduling)",
    "m3_only": "M3 only (Adaptive Control)",
    "full": "Full (M1+M2+M3)",
}

# Axis-tick versions of the above. Not in the Streamlit original: needed
# because five full labels along one x-axis force Plotly to rotate them, and
# rotated they run past the bottom of a chart cell. Tables and hover tooltips
# still use the full ARM_LABELS, so nothing loses its meaning.
ARM_SHORT = {
    "baseline": "Baseline",
    "m1_only": "M1 only",
    "m2_only": "M2 only",
    "m3_only": "M3 only",
    "full": "Full",
}

TEXT_PRIMARY = "#0b0b0b"
TEXT_SECONDARY = "#52514e"
GRIDLINE = "#e1e0d9"
