import { http } from "./http.js";

export async function login({ username, password }) {
  const { data } = await http.post("/api/auth/login", { username, password });
  if (!data?.ok) throw new Error(data?.error || "Login falló");
  return data; // { ok, token, user }
}

export async function getMe() {
  const { data } = await http.get("/api/auth/me");
  if (!data?.ok) throw new Error(data?.error || "No pude obtener sesión");
  return data.user;
}
