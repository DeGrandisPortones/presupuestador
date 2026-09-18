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

http.interceptors.response.use(
  (r) => r,
  (err) => {
    // si el back responde 401, limpiamos token
    if (err?.response?.status === 401) {
      localStorage.removeItem(TOKEN_KEY);
    }

    const msg =
      err?.response?.data?.error ||
      err?.response?.data?.message ||
      err?.message ||
      "Error HTTP";
    // Se conserva el status HTTP en el Error (ej. 413 de un body-parser que
    // rechaza el JSON por tamaño, que no trae `data.error`) para que quien
    // llama pueda dar un mensaje específico para ese caso puntual.
    const normalized = new Error(msg);
    normalized.status = err?.response?.status;
    return Promise.reject(normalized);
  }
);

export { TOKEN_KEY };
