Hotfix Vercel:
- Se corrigió la expresión que mezclaba || con ?? sin paréntesis.
- Cambio mínimo: solo store.js.

Línea corregida:
- odoo_id: Number(l.odoo_id || l.odoo_template_id || l.product_id || (idx + 1))

Archivo:
- cotizador-front/src/domain/quote/store.js
