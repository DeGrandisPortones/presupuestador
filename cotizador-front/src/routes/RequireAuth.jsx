import { Navigate } from "react-router-dom";
import { useAuthStore } from "../domain/auth/store.js";

export default function RequireAuth({ children }) {
  const token = useAuthStore((s) => s.token);
  if (!token) return <Navigate to="/login" replace />;
  return children;
}
