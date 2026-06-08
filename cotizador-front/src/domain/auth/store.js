import { create } from "zustand";
import { TOKEN_KEY } from "../../api/http.js";
import { clearAllBootstraps, hasAnyOdooBootstrap } from "../odoo/bootstrap.js";

function initialOdooStatus() {
  return hasAnyOdooBootstrap() ? "online" : "offline";
}

function userCanUseAssignedPricelist(user = {}) {
  return user?.is_distribuidor === true && user?.is_vendedor !== true && user?.is_superuser !== true;
}

function normalizeUserForRole(user) {
  if (!user) return null;
  return {
    ...user,
    odoo_pricelist_id: userCanUseAssignedPricelist(user) ? (user.odoo_pricelist_id ?? null) : null,
  };
}

export const useAuthStore = create((set) => ({
  token: localStorage.getItem(TOKEN_KEY) || null,
  user: null,
  odooStatus: initialOdooStatus(),

  setSession({ token, user }) {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    set({ token, user: normalizeUserForRole(user) });
  },

  setUser(user) {
    set({ user: normalizeUserForRole(user) });
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
