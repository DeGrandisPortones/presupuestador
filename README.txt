Bundle de fix para PRESUPUESTADOR

Archivos a reemplazar:
- cotizador-front/src/pages/PresupuestosPage/index.jsx
- cotizador-front/src/layouts/AppLayout.jsx
- cotizador-front/src/pages/AprobacionTecnicaPage/index.jsx
- cotizador-front/src/pages/MedicionDetailPage/index.jsx
- cotizador-back/src/measurementFinalization.js

Que corrige:
1. Mis presupuestos:
   - Ver Original descarga el PDF original.
   - Ver Final descarga el PDF final.
   - Ver medicion / Ver detalle tecnico abre la planilla de medicion.
   - Se elimina el icono PDF en la grilla.
2. Tecnica:
   - En Portones sin medicion no aparece asignar fecha / visita del medidor.
   - Se oculta el menu Mediciones cuando el usuario tambien es Rev. Tecnica.
3. Planilla:
   - El vendedor/distribuidor dueno del presupuesto puede verla en solo lectura.
4. Odoo:
   - Se restaura la carga de vendedor y forma de pago/financiacion en la venta final creada desde measurementFinalization.

Pasos:
1. Reemplazar estos archivos.
2. Reiniciar front y back.
3. Probar:
   - presupuesto original -> Ver Original
   - presupuesto con copia final -> Ver Final
   - porton con medicion aprobada -> Ver medicion
   - porton sin medicion -> Ver detalle tecnico
   - Tecnica > Portones sin medicion: sin fecha de visita
   - aprobacion de medicion -> validar vendedor y forma de pago en Odoo
