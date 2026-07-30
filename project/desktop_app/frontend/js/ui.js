// Shared UI primitives: loading indicators and chart theming.
//
// Both exist to stop the same decision being re-made per page. Before this,
// each page hinted at loading differently (or not at all), and the Plotly
// figures the backend builds carried the Streamlit dashboard's light-theme
// text color, which is near-black - invisible against this app's dark surface.

// --- loading ---------------------------------------------------------------

/** Markup for a "loading" placeholder. `variant`: "block" (centred, for an
 *  empty region), "inline" (left-aligned, next to existing content), or
 *  "overlay" (covers a sized container, e.g. a chart cell whose height is
 *  already reserved - so the page doesn't jump when the chart appears). */
function spinnerHTML(text = "Loading…", variant = "block") {
  const cls = variant === "block" ? "" : ` ${variant}`;
  return `<div class="spinner-wrap${cls}"><div class="spinner"></div><span>${text}</span></div>`;
}

/** Replaces an element's content with a spinner. Returns the element so a
 *  caller can keep a handle on it. */
function showSpinner(el, text = "Loading…", variant = "block") {
  const node = typeof el === "string" ? document.getElementById(el) : el;
  if (node) node.innerHTML = spinnerHTML(text, variant);
  return node;
}

/** Puts a button into a busy state and returns a restore function. Disabling
 *  matters as much as the spinner: these buttons start cluster jobs, and a
 *  double-click would start the job twice. */
function buttonBusy(btn, busyText) {
  const node = typeof btn === "string" ? document.getElementById(btn) : btn;
  if (!node) return () => {};
  const originalHTML = node.innerHTML;
  const wasDisabled = node.disabled;
  node.disabled = true;
  node.innerHTML = `<span class="spinner small"></span>${busyText || node.textContent}`;
  return () => {
    node.innerHTML = originalHTML;
    node.disabled = wasDisabled;
  };
}

// --- chart theming ---------------------------------------------------------

function prefersDark() {
  return !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
}

/** The ink and gridline colors for the current color scheme. Text always
 *  wears a text token, never a series color. */
function chartTheme() {
  return prefersDark()
    ? { text: "#9aa3b2", textStrong: "#e6e9ef", grid: "#2a2f38" }
    : { text: "#52514e", textStrong: "#14171c", grid: "#e1e0d9" };
}

/** Patches a server-built Plotly figure for this app's surface, in place.
 *
 *  The backend builds figures with the same code path as the Streamlit
 *  dashboard, which assumed a white page: no explicit background (so Plotly
 *  defaults to opaque white) and near-black label text. Rather than fork the
 *  figure-building code, the presentation layer that knows the color scheme
 *  fixes it here. Bar value labels also get cliponaxis:false so an "outside"
 *  label on the tallest bar isn't clipped by the plot edge. */
function themeFigure(fig) {
  const t = chartTheme();
  const layout = fig.layout || (fig.layout = {});
  layout.paper_bgcolor = "rgba(0,0,0,0)";
  layout.plot_bgcolor = "rgba(0,0,0,0)";
  layout.font = { ...(layout.font || {}), color: t.text, size: 11 };
  if (layout.title) layout.title = { ...layout.title, font: { color: t.textStrong, size: 13 } };
  // Spread-then-override, so whatever the figure already set (rangemode,
  // automargin, dtick) survives - only the theme-dependent keys are replaced.
  for (const axis of ["xaxis", "yaxis"]) {
    layout[axis] = { ...(layout[axis] || {}), gridcolor: t.grid, zeroline: false };
    if (layout[axis].title) {
      layout[axis].title = { ...layout[axis].title, font: { color: t.text } };
    }
  }
  // Margins are set by whoever built the figure (it knows its own axis titles
  // and tick-label lengths); only fill them in if absent.
  if (!layout.margin) layout.margin = { t: 46, b: 44, l: 70, r: 18 };
  for (const trace of fig.data || []) {
    if (trace.type === "bar") {
      trace.cliponaxis = false;
      trace.textfont = { ...(trace.textfont || {}), color: t.textStrong };
    }
  }
  return fig;
}

const PLOT_CONFIG = { displayModeBar: false, responsive: true };
