import axios from "axios";

const TOKEN_KEY = "presupuestador_token";

export const http = axios.create({
  baseURL: "",
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
    return Promise.reject(new Error(msg));
  }
);

export { TOKEN_KEY };
