import { create } from "zustand";
import { TOKEN_KEY } from "../../api/http.js";
import { clearAllBootstraps } from "../odoo/bootstrap.js";

export const useAuthStore = create((set) => ({
  token: localStorage.getItem(TOKEN_KEY) || null,
  user: null,
  odooOnline: false,

  setSession({ token, user }) {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    set({ token, user: user || null });
  },

  setUser(user) {
    set({ user: user || null });
  },

  setOdooOnline(odooOnline) {
    set({ odooOnline: !!odooOnline });
  },

  logout() {
    localStorage.removeItem(TOKEN_KEY);
    clearAllBootstraps();
    set({ token: null, user: null, odooOnline: false });
  },
}));
