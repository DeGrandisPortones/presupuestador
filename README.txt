ZIP directo para copiar y pegar en la raiz del repo.

Cambio incluido:
- Se modifica cotizador-back/src/routes/pdf.routes.js.
- En el PDF de presupuesto/proforma, la seccion posterior a los datos del cliente se separa en dos bloques:
  1) Forma de pago y fecha estimada de entrega.
  2) Datos tecnicos/restantes: medidas de paso, peso, piernas y observaciones.
- No cambia calculos, precios, items, aprobaciones ni guardado.

Uso:
1) Descomprimir en la raiz del repositorio.
2) Reemplazar archivos cuando el sistema lo pida.
3) Reiniciar el backend para tomar el cambio.
