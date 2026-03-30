import { create } from "zustand";
import { TOKEN_KEY } from "../../api/http.js";
import { clearAllBootstraps, hasAnyOdooBootstrap } from "../odoo/bootstrap.js";

function initialOdooStatus() {
  return hasAnyOdooBootstrap() ? "online" : "offline";
}

export const useAuthStore = create((set) => ({
  token: localStorage.getItem(TOKEN_KEY) || null,
  user: null,
  odooStatus: initialOdooStatus(),

  setSession({ token, user }) {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    set({ token, user: user || null });
  },

  setUser(user) {
    set({ user: user || null });
  },

  setOdooStatus(status) {
    const next = String(status || "offline").trim().toLowerCase() === "online" ? "online" : "offline";
    set({ odooStatus: next });
  },

  logout() {
    localStorage.removeItem(TOKEN_KEY);
    clearAllBootstraps();
    set({ token: null, user: null, odooStatus: "offline" });
  },
}));
