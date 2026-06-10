# Reemplazo flujo Ipanel / Puertas

Este ZIP NO trae `changes.patch`.

Uso:

1. Copiar la carpeta `scripts` en la raiz del repositorio `presupuestador`.
2. Desde la raiz del repo ejecutar:

```bash
node scripts/aplicar_flujo_ipanel_puertas.cjs
```

El script modifica estos archivos existentes:

- `cotizador-back/src/routes/quotes.routes.js`
- `cotizador-back/src/routes/measurements.routes.js`
- `cotizador-back/src/quotesSchema.js`
- `cotizador-back/src/measurementFinalization.js`
- `cotizador-front/src/pages/MedicionDetailPage/index.jsx`

Cambios incluidos:

- Ipanel acopio usa producto Odoo 3607.
- Ipanel produccion entra al circuito tecnico sin medidor.
- Ipanel acopio mantiene instancia editable y al pasar a produccion pide aprobacion final tecnica.
- Puerta entra al circuito de portones, con medicion de 2 altos y 2 anchos.
- Medidor no puede cambiar secciones/productos en puertas.
- Listados de produccion incluyen porton, ipanel y puerta.
- Migracion segura de Ipanels existentes para que entren al flujo.

Recomendado antes de produccion:

```bash
git status
node scripts/aplicar_flujo_ipanel_puertas.cjs
npm run build
```
