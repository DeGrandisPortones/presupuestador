Reemplaza SOLO:
- cotizador-back/src/odoo.js

Este fix:
- intenta JSON-RPC clásico
- si eso falla, intenta el flujo web de Odoo:
  /web/session/authenticate
  /web/dataset/call_kw/...

No toca ninguna otra parte del sistema.
