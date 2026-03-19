Cambios preparados para DeGrandisPortones/presupuestador

Archivos incluidos:
- cotizador-front/src/App.jsx
- cotizador-front/src/pages/CotizadorPage/index.jsx
- cotizador-front/src/pages/PresupuestosPage/index.jsx
- cotizador-front/src/pages/PuertaChecklistPage/index.jsx
- cotizador-front/src/pages/PuertaWorkflowPage/index.jsx
- cotizador-back/src/quotesSchema.js
- cotizador-back/src/routes/pdf.routes.js

Qué resuelve:
1. Se quita el botón "Puerta" del cotizador de portones.
2. En Mis presupuestos, cada portón guardado sin puerta vinculada muestra el botón "Agregar puerta".
3. Ese botón abre un flujo nuevo para puerta vinculada al portón, eligiendo si empezar por Ipanel o por Marco.
4. Al guardar/enviar uno de los dos pasos del flujo, navega automáticamente al otro para completar la puerta.
5. Los PDF de presupuesto/proforma ahora muestran vendedor.
6. Los presupuestos portón/ipanel reciben quote_number correlativo en backend (columna quote_number + secuencia).
7. Al descargar PDF desde cotizador, primero persiste el presupuesto para usar el número correlativo real.
8. En el circuito actual, el vendedor también viaja en la nota del presupuesto para que llegue a Odoo sin depender de user_id/licencia.

Nota sobre Odoo:
- Este paquete NO vincula al vendedor directamente a un empleado de Odoo en un campo nativo de sale.order.
- Odoo estándar espera un usuario para user_id; si querés llevarlo a empleado sin licencia, conviene crear un campo custom en Odoo.
- Mientras tanto, el vendedor se envía en la nota y en el PDF.
