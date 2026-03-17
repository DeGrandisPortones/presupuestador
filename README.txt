Reemplazá SOLO la función buildInitialDoorRecord en:
cotizador-back/src/routes/doors.routes.js

El error de Render sale en POST /api/doors/from-quote y corresponde a una referencia a variable mal escrita:
- correcto: responsible
- incorrecto: responsable (como variable)

Usá exactamente este bloque:
function buildInitialDoorRecord({ quote = null, user }) {
  const responsible = safeText(user?.full_name || user?.username);
  const endCustomer = quote
    ? customerFromQuote(quote)
    : { name: "", phone: "", email: "", address: "", maps_url: "", city: "" };

  return {
    end_customer: endCustomer,
    obra_cliente: endCustomer.name || "",
    nv: "",
    tipo: "Puerta principal",
    vista: "Exterior",
    responsable: responsible,
    proveedor: "",
    proveedor_condiciones: "",
    fecha: nowDate(),
    nv_proveedor: "",
    asociado_porton: buildLinkedPortonLabel(quote),
    sentido_apertura: "ADENTRO",
    mano_bisagras: "IZQUIERDA",
    angulo_apertura: "90",
    angulo_otro: "",
    motivo_no_estandar: "",
    interferencias: "Ninguna",
    accesorios: "Ninguno",
    tipo_marco: "",
    tipo_hoja: "",
    lado_cerradura: "",
    ancho_marco_mm: "",
    alto_marco_mm: "",
    ipanel_quote_id: "",
    ipanel_quote_label: "",
    observaciones: "",
    sale_amount: "",
    purchase_amount: "",
    supplier_odoo_partner_id: "",
    checklist: buildChecklist(responsible),
  };
}
