ZIP: PDF sin IVA discriminado + selector Ipanel

Copiar y reemplazar estos archivos:

- cotizador-back/src/routes/pdf.routes.js
- cotizador-front/src/pages/CotizadorPage/index.jsx

Cambios:

1) PDF Presupuesto cliente
- Ya no muestra Subtotal s/IVA.
- Ya no muestra IVA.
- Ya no muestra textos c/IVA ni IVA incluido.
- Sigue usando el mismo importe final, con IVA incluido en el precio, pero sin discriminarlo.
- La Proforma queda igual que antes.

2) Ipanel vinculado a porton
- Fuerza recarga del listado de portones disponibles al entrar.
- Evita quedar con cache vacia en /cotizador/ipanel.
- Trata catalog_kind vacio/null como porton para que aparezcan presupuestos viejos.
- El selector sigue buscando por presupuesto, NP, NV, cliente, telefono o localidad.

Despues de copiar:

Backend:
- Reiniciar backend.

Frontend:
cd cotizador-front
rm -rf dist node_modules/.vite
npm run build

Luego redeploy sin cache y Ctrl+F5.
