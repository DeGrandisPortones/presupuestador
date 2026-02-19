import { create } from "zustand";
import { TOKEN_KEY } from "../../api/http.js";
import { clearOdooBootstrap } from "../odoo/bootstrap.js";

export const useAuthStore = create((set) => ({
  token: localStorage.getItem(TOKEN_KEY) || null,
  user: null,

  setSession({ token, user }) {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    set({ token, user: user || null });
  },

  setUser(user) {
    set({ user: user || null });
  },

  logout() {
    localStorage.removeItem(TOKEN_KEY);
    clearOdooBootstrap();
    set({ token: null, user: null });
  },
}));
