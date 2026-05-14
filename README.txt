ZIP directo para copiar y pegar en la raiz del repo.

Incluye:
- cotizador-back/src/routes/pdf.routes.js
- cotizador-back/src/assets/logo-ipanel.png

Cambio:
- En PDFs de Ipanel, usa el logo Ipanel enviado por el usuario.
- El logo fue recortado al contenido de la marca para que no quede deformado ni demasiado chico por el fondo negro del PNG original.
- En PDFs de portones y otros sigue usando el logo De Grandis actual.
- No toca precios, items, financiamiento, medicion, aprobaciones ni Odoo.

Validacion:
- node --check sobre pdf.routes.js
