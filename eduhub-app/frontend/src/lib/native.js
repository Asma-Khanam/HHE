import { Capacitor } from "@capacitor/core";

// True when running inside the iOS / Android app (not the normal website).
export const isNativeApp = Capacitor.isNativePlatform();

// The website calls its own server at "/api/...". Inside the app there is no
// server of its own, so those calls go to the live site instead.
const API_BASE = import.meta.env.VITE_API_BASE || "https://hhe.vercel.app";
export const apiUrl = (path) => (isNativeApp ? `${API_BASE}${path}` : path);

// Runs once when the app opens: tidy status bar, hide the splash screen.
export async function initNativeApp() {
  if (!isNativeApp) return;
  try {
    const { StatusBar, Style } = await import("@capacitor/status-bar");
    await StatusBar.setStyle({ style: Style.Light });
  } catch {
    /* not available on this device */
  }
  try {
    const { SplashScreen } = await import("@capacitor/splash-screen");
    await SplashScreen.hide();
  } catch {
    /* not available on this device */
  }
}
