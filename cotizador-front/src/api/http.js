import axios from "axios";

const TOKEN_KEY = "presupuestador_token";

export const http = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "",
  timeout: 30000,
});

// 🔐 Agrega Bearer token si existe
http.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Evita disparar el hard-reload mas de una vez si varios requests en vuelo
// devuelven 401 al mismo tiempo (ej: varias queries de react-query juntas).
let sessionExpiredRedirectTriggered = false;

http.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err?.response?.status === 401) {
      const hadToken = !!localStorage.getItem(TOKEN_KEY);
      localStorage.removeItem(TOKEN_KEY);

      // Solo forzamos la redirección si había una sesión iniciada (token
      // presente) y no estamos ya en /login: un 401 en una ruta pública
      // (ej. /aceptacion-cliente/:token, donde nunca hay token) no debe
      // mandar a un cliente final a la pantalla de login del vendedor.
      const onLoginPage = window.location.pathname.startsWith("/login");
      if (hadToken && !onLoginPage && !sessionExpiredRedirectTriggered) {
        sessionExpiredRedirectTriggered = true;
        // Hard navigation (no react-router): así el navegador vuelve a pedir
        // index.html + el bundle JS actual, en vez de seguir corriendo el
        // JS que ya tenía cargado en memoria desde que abrió la pestaña.
        window.location.href = "/login";
      }
    }

    const msg =
      err?.response?.data?.error ||
      err?.response?.data?.message ||
      err?.message ||
      "Error HTTP";
    return Promise.reject(new Error(msg));
  }
);

export { TOKEN_KEY };
