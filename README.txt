FIX pantalla blanca en Presupuesto Otros

Reemplazar desde la raiz del repo:

cotizador-front/src/pages/CotizadorPage/components/LineRow.jsx

Correccion:
- Elimina cualquier referencia a usesIntegerQty.
- Mantiene cantidad editable para lineas marcadas como free_quantity / quantity_editable / quantity_mode='free'.
- Agrega un cambio real en el output del bundle (data-qty-mode / title / aria-label) para forzar hash nuevo del build.

Despues de copiar:
1) cd cotizador-front
2) rm -rf dist node_modules/.vite
3) npm run build
4) redeploy del frontend sin cache si estas en Vercel
5) Ctrl+F5 en el navegador

Verificacion:
grep -R "usesIntegerQty" cotizador-front/src

No deberia devolver nada.
