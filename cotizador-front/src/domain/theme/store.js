import { create } from "zustand";

const STORAGE_KEY = "dgp_theme_mode"; // "light" | "dark" | "auto"
const VALID_MODES = new Set(["light", "dark", "auto"]);

function prefersDark() {
  return typeof window !== "undefined" && !!window.matchMedia
    ? window.matchMedia("(prefers-color-scheme: dark)").matches
    : false;
}

function resolveTheme(mode) {
  return mode === "auto" ? (prefersDark() ? "dark" : "light") : mode;
}

function applyTheme(theme) {
  if (typeof document !== "undefined") {
    document.documentElement.setAttribute("data-theme", theme);
  }
}

function readInitialMode() {
  if (typeof window === "undefined") return "auto";
  const saved = window.localStorage.getItem(STORAGE_KEY);
  return VALID_MODES.has(saved) ? saved : "auto";
}

const initialMode = readInitialMode();
const initialTheme = resolveTheme(initialMode);
applyTheme(initialTheme);

export const useThemeStore = create((set) => ({
  mode: initialMode,
  theme: initialTheme,

  setMode(mode) {
    const next = VALID_MODES.has(mode) ? mode : "auto";
    const theme = resolveTheme(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // localStorage no disponible (modo privado, etc.), no bloquea el cambio de tema
    }
    applyTheme(theme);
    set({ mode: next, theme });
  },
}));

if (typeof window !== "undefined" && window.matchMedia) {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const onSystemChange = () => {
    if (useThemeStore.getState().mode !== "auto") return;
    const theme = prefersDark() ? "dark" : "light";
    applyTheme(theme);
    useThemeStore.setState({ theme });
  };
  if (mq.addEventListener) mq.addEventListener("change", onSystemChange);
  else if (mq.addListener) mq.addListener(onSystemChange);
}
