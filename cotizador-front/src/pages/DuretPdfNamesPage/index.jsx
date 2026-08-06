import SuperuserProductPdfNamesPage from "../SuperuserProductPdfNamesPage/index.jsx";

// Seccion "Duret" del dashboard: misma pantalla que "Nombres PDF productos",
// pero apuntando a la lista de nombres propia de la marca Duret (brand="duret"
// en el backend). Un vendedor con users.pdf_brand='duret' recibe un PDF de
// presupuesto con formato/logo propio (ver routes/pdf.routes.js); las
// descripciones de producto que aparecen ahi se configuran acá, separadas de
// las que usa el PDF estandar De Grandis.
export default function DuretPdfNamesPage() {
  return (
    <SuperuserProductPdfNamesPage
      brand="duret"
      title="Duret — Nombres PDF productos"
      subtitle="Nombres de producto que van a aparecer en el presupuesto con formato Duret (marca propia). No afecta el PDF estándar De Grandis. Si queda vacío, usa el nombre que devuelve Odoo."
    />
  );
}
