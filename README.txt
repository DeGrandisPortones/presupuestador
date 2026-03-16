Reemplazar estos archivos directamente en el repo:

- cotizador-front/src/pages/CotizadorPage/index.jsx
- cotizador-front/src/pages/PresupuestosPage/index.jsx
- cotizador-front/src/pages/MedicionesPage/index.jsx
- cotizador-front/src/pages/AprobacionComercialPage/index.jsx
- cotizador-front/src/pages/AprobacionTecnicaPage/index.jsx
- cotizador-front/src/pages/PuertasPage/index.jsx

Luego reiniciar frontend.

Notas:
- Restaura la elección Acopio / Producción al confirmar.
- Cuando el usuario tiene ambos roles o es superusuario, el cotizador crea el presupuesto como vendedor para que entre a Aprobación Comercial y no falle el flujo de Odoo por partner faltante.
- Amplía la búsqueda en listados y mantiene paginado de 25.
