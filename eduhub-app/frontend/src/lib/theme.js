// Light / Dark / Automatic (follows the iPhone's own setting).
// The choice is remembered on the device. index.html applies it before the
// first paint; this file keeps it in step afterwards (and when the phone flips
// between light and dark while the app is open in Automatic).
const KEY = "hh-theme";
export const THEME_CHOICES = ["light", "dark", "auto"];

export function getThemePreference() {
  try {
    const v = localStorage.getItem(KEY);
    return THEME_CHOICES.includes(v) ? v : "auto";
  } catch {
    return "auto";
  }
}

function systemIsDark() {
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  } catch {
    return false;
  }
}

export function resolveTheme(pref = getThemePreference()) {
  return pref === "dark" || (pref === "auto" && systemIsDark()) ? "dark" : "light";
}

async function syncStatusBar(theme) {
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) return;
    const { StatusBar, Style } = await import("@capacitor/status-bar");
    // "Dark" style = light text, for dark backgrounds.
    await StatusBar.setStyle({ style: theme === "dark" ? Style.Dark : Style.Light });
  } catch {
    /* not available */
  }
}

export function applyTheme(pref = getThemePreference()) {
  const theme = resolveTheme(pref);
  document.documentElement.setAttribute("data-theme", theme);
  syncStatusBar(theme);
  return theme;
}

export function setThemePreference(pref) {
  try {
    localStorage.setItem(KEY, pref);
  } catch {
    /* private window etc. -- still applies for this session */
  }
  return applyTheme(pref);
}

export function initTheme() {
  applyTheme();
  try {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => getThemePreference() === "auto" && applyTheme("auto");
    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else if (mq.addListener) mq.addListener(onChange);
  } catch {
    /* fine */
  }
}
