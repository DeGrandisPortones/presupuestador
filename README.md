Reemplazar:
- cotizador-front/src/pages/CotizadorPage/components/HeaderBar.jsx
- cotizador-front/src/pages/CotizadorPage/components/PortonDimensions.jsx
- cotizador-front/src/pages/CotizadorPage/components/SectionCatalog.jsx
- cotizador-front/src/pages/DashboardPage/index.jsx
- cotizador-back/src/settingsDb.js
- cotizador-back/src/routes/admin.routes.js

Cambios incluidos:
- se quita selector manual de Tipo / Sistema
- se deriva porton_type en segundo plano por combinacion de productos
- se agregan dependencias entre secciones configurables desde Dashboard > Dependencias
- se reemplaza Medicion => Productos por Dependencias
- se cambia Financiacion por Forma de pago
- se habilita a Enc. Comercial para guardar dependencias/derivaciones
