FIX: Cantidad editable en Presupuesto Otros acepta punto y coma decimal.

Archivo incluido:
- cotizador-front/src/pages/CotizadorPage/components/LineRow.jsx

Cambio:
- En lineas con cantidad editable, el input usa texto decimal controlado.
- Acepta tanto punto como coma: 2.5 / 2,5.
- Si el usuario esta escribiendo un valor parcial como '.', ',', '2.' o '2,', no se manda cero al store y no se borra el producto.
- Al salir del campo con un valor incompleto, vuelve al ultimo valor valido.

Luego de copiar:
cd cotizador-front
rm -rf dist node_modules/.vite
npm run build
