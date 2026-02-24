// Listados fijos del Presupuestador (no dependen de Odoo)

// Tipos/Sistemas de portón (según captura). I-PANEL se maneja en cotizador aparte.
export const PORTON_TYPES = [
  { key: "acero_simil_aluminio_clasico", label: "ACERO SIMIL ALUMINIO CLASICO" },
  { key: "coplanar_acero_simil_aluminio_clasico", label: "COPLANAR ACERO SIMIL ALUMINIO CLASICO" },
  { key: "acero_simil_aluminio_doble_iny", label: "ACERO SIMIL ALUMINIO DOBLE INY" },
  { key: "coplanar_acero_simil_aluminio_doble_iny", label: "COPLANAR ACERO SIMIL ALUMINIO DOBLE INY" },
  { key: "para_revestir_con_al_pvc_otros", label: "Para revestir con AL-PVC-OTROS" },
  { key: "estandar_acero_simil_aluminio", label: "ESTANDAR ACERO SIMIL ALUMINIO" },
  { key: "estandar_acero_simil_madera", label: "ESTANDAR ACERO SIMIL MADERA" },
  { key: "acero_simil_madera_clasico", label: "ACERO SIMIL MADERA CLASICO" },
  { key: "coplanar_acero_simil_madera_clasico", label: "COPLANAR ACERO SIMIL MADERA CLASICO" },
  { key: "acero_simil_madera_doble_iny", label: "ACERO SIMIL MADERA DOBLE INY" },
  { key: "coplanar_acero_simil_madera_doble_iny", label: "COPLANAR ACERO SIMIL MADERA DOBLE INY" },
  { key: "revestimiento_wpc", label: "REVESTIMIENTO WPC" },
  { key: "corredizo_simil_madera", label: "CORREDIZO SIMIL MADERA" },
  { key: "corredizo_simil_aluminio_doble", label: "CORREDIZO SIMIL ALUMINIO DOBLE" },
  { key: "corredizo_simil_madera_doble", label: "CORREDIZO SIMIL MADERA DOBLE" },
  { key: "corredizo_simil_aluminio", label: "CORREDIZO SIMIL ALUMINIO" },
];

export const PAYMENT_METHODS = [
  "CHEQUE 0 - 30 - 60",
  "CHEQUE 0 - 30 - 60 - 90 -120",
  "CORDOBESA 10 CUOTAS",
  "CORDOBESA 14 CUOTAS",
  "CORDOBESA 18 CUOTAS",
  "CORDOBESA 4 CUOTAS",
  "CORDOBESA 6 CUOTAS",
  "CUENTA CORRIENTE",
  "EFECTIVO - TRANSFERENCIA",
  "NARANJA 12 CUOTAS",
  "NARANJA 3 CUOTAS",
  "NARANJA 6 CUOTAS",
  "OTRAS TC BANC 3 CUOTAS",
  "OTRAS TC BANC 6 CUOTAS",
];

export function portonTypeLabel(key) {
  const found = PORTON_TYPES.find((x) => x.key === key);
  return found ? found.label : "";
}
