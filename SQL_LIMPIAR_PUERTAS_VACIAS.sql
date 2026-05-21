-- Borra solo puertas borrador totalmente vacias generadas por el fallo de creacion.
-- Revisar antes de ejecutar en produccion.

delete from public.presupuestador_doors
where status = 'draft'
  and linked_quote_id is null
  and structure_quote_id is null
  and odoo_sale_order_id is null
  and odoo_purchase_order_id is null
  and coalesce(record->>'structure_quote_id', '') = ''
  and coalesce(record->>'ipanel_quote_id', '') = ''
  and coalesce(record->'end_customer'->>'name', '') = ''
  and coalesce(record->'end_customer'->>'phone', '') = ''
  and coalesce(record->>'obra_cliente', '') = '';
