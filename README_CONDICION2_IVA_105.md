# Ajuste Condición 2 - IVA 10,5%

Cambios incluidos:

- Condición 2 ya no descuenta 10,5% en cada producto.
- La pantalla del presupuestador calcula el IVA al 10,5% cuando `condition_mode = cond2`.
- Condición 1 sigue calculando IVA al 21%.
- El PDF de presupuesto usa el mismo criterio: Condición 2 totaliza con IVA 10,5%.
- La proforma mantiene precios netos y usa 10,5% para Condición 2.
- El envío a Odoo se mantiene como estaba en el paquete anterior: Condición 1 envía neto; Condición 2 envía neto + 10,5%.
- En el resumen se muestra `IVA (10,5%)` o `IVA (21,0%)` según corresponda.

Sobre presupuestos existentes:

- Si abrís un presupuesto existente con Condición 2, la pantalla recalcula con estas reglas nuevas.
- Si tocás "Actualizar presupuesto", además refresca precios base/lista actual y guarda el presupuesto con esos valores.
- No modifica órdenes ya creadas en Odoo ni PDFs ya descargados anteriormente.
