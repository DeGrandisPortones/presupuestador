import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import CotizadorPage from "./pages/CotizadorPage/index.jsx";
import MenuPage from "./pages/MenuPage/index.jsx";
import PuertasPage from "./pages/PuertasPage/index.jsx";

const CotizadorPortonRoute = () => <CotizadorPage catalogKind="porton" />;
const CotizadorIpanelRoute = () => <CotizadorPage catalogKind="ipanel" />;
const CotizadorOtrosRoute = () => <CotizadorPage catalogKind="otros" />;

import LoginPage from "./pages/LoginPage/index.jsx";

import PresupuestosPage from "./pages/PresupuestosPage/index.jsx";
import QuoteDetailPage from "./pages/QuoteDetailPage/index.jsx";
import AprobacionComercialPage from "./pages/AprobacionComercialPage/index.jsx";
import AprobacionTecnicaPage from "./pages/AprobacionTecnicaPage/index.jsx";
import DashboardPage from "./pages/DashboardPage/index.jsx";
import PlanificacionPage from "./pages/PlanificacionPage/index.jsx";
import SuperuserMeasurementRulesPage from "./pages/SuperuserMeasurementRulesPage/index.jsx";
import SuperuserProductPdfNamesPage from "./pages/SuperuserProductPdfNamesPage/index.jsx";
import UsersAdminPage from "./pages/UsersAdminPage/index.jsx";
import MedicionesPage from "./pages/MedicionesPage/index.jsx";
import MedicionDetailPage from "./pages/MedicionDetailPage/index.jsx";
import ClientAcceptancePage from "./pages/ClientAcceptancePage/index.jsx";
import PuertaChecklistPage from "./pages/PuertaChecklistPage/index.jsx";
import PuertaWorkflowPage from "./pages/PuertaWorkflowPage/index.jsx";
import PuertaPanelPage from "./pages/PuertaPanelPage/index.jsx";
import TechnicalConsultsPage from "./pages/TechnicalConsultsPage/index.jsx";
import QuoteHistoryViewerPage from "./pages/QuoteHistoryViewerPage/index.jsx";
import SalesActorActivityPage from "./pages/SalesActorActivityPage/index.jsx";

import RequireAuth from "./routes/RequireAuth.jsx";
import AppLayout from "./layouts/AppLayout.jsx";

import { useAuthStore } from "./domain/auth/store.js";
import { getMe } from "./api/auth.js";
import { prefetchOdooBootstrapInBackground } from "./domain/odoo/prefetch.js";

export default function App() {
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const logout = useAuthStore((s) => s.logout);

  useEffect(() => {
    if (!token) return;
    if (user) return;
    getMe().then(setUser).catch(() => logout());
  }, [token, user, setUser, logout]);

  useEffect(() => {
    if (!token || !user) return;
    window.setTimeout(() => { prefetchOdooBootstrapInBackground().catch(() => {}); }, 0);
  }, [token, user]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/aceptacion-cliente/:token" element={<ClientAcceptancePage />} />
        <Route path="/" element={<RequireAuth><AppLayout /></RequireAuth>}>
          <Route index element={<Navigate to="/menu" replace />} />
          <Route path="menu" element={<MenuPage />} />
          <Route path="cotizador" element={<CotizadorPortonRoute />} />
          <Route path="cotizador/:id" element={<CotizadorPortonRoute />} />
          <Route path="cotizador/ipanel" element={<CotizadorIpanelRoute />} />
          <Route path="cotizador/ipanel/:id" element={<CotizadorIpanelRoute />} />
          <Route path="cotizador/otros" element={<CotizadorOtrosRoute />} />
          <Route path="cotizador/otros/:id" element={<CotizadorOtrosRoute />} />
          <Route path="puertas" element={<PuertasPage />} />
          <Route path="puertas/nuevo/:quoteId" element={<PuertaWorkflowPage />} />
          <Route path="puertas/:id" element={<PuertaPanelPage />} />
          <Route path="puertas/:id/marco" element={<PuertaChecklistPage />} />
          <Route path="presupuestos" element={<PresupuestosPage />} />
          <Route path="presupuestos/:id" element={<QuoteDetailPage />} />
          <Route path="mediciones" element={<MedicionesPage />} />
          <Route path="mediciones/:id" element={<MedicionDetailPage />} />
          <Route path="aprobacion/comercial" element={<AprobacionComercialPage />} />
          <Route path="aprobacion/tecnica" element={<AprobacionTecnicaPage />} />
          <Route path="consultas-tecnicas" element={<TechnicalConsultsPage />} />
          <Route path="usuarios" element={<UsersAdminPage />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="planificacion" element={<PlanificacionPage />} />
          <Route path="dashboard/reglas-tecnicas" element={<SuperuserMeasurementRulesPage />} />
          <Route path="superuser/nombres-pdf" element={<SuperuserProductPdfNamesPage />} />
          <Route path="superuser/visualizador-porton" element={<QuoteHistoryViewerPage />} />
          <Route path="superuser/actividad-vendedores" element={<SalesActorActivityPage />} />
        </Route>
        <Route path="*" element={<Navigate to={token ? "/menu" : "/login"} replace />} />
      </Routes>
    </BrowserRouter>
  );
}
