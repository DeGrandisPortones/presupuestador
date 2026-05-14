Cambio: logo Ipanel en PDFs de Ipanel

Copiar el contenido de este ZIP sobre la raiz del repo.

Archivos incluidos:
- cotizador-back/src/routes/pdf.routes.js
- cotizador-back/src/assets/logo-ipanel.png

Que hace:
- En PDFs de presupuesto/proforma, si el presupuesto viene con catalog_kind = "ipanel", el encabezado usa logo-ipanel.png.
- Para portones y otros sigue usando logo-degrandis.png.
- La planilla de medicion sigue usando De Grandis, sin cambios.

No toca precios, items, financiamiento, aprobaciones, medicion ni Odoo.
