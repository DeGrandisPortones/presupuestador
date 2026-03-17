Cambios preparados para DeGrandisPortones/presupuestador

Archivos incluidos:
- cotizador-front/src/pages/PresupuestosPage/index.jsx
- cotizador-front/src/pages/PuertaChecklistPage/index.jsx

Qué resuelve:
1. Mis presupuestos ahora diferencia Portón / Ipanel / Puerta.
2. En el filtro de mediciones muestra fecha de medición asignada y estado.
3. Marco de puerta recupera los campos anteriores del form y conserva ancho/alto + cálculo de Ipanel.

Notas:
- No requiere cambios de backend para estos tres pedidos.
- El listado de puertas en Mis presupuestos usa el endpoint existente /api/doors?scope=mine.
