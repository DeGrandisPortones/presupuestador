Paquete de cambios - Consulta técnica / tickets persistentes

Archivos incluidos:

cotizador-back/src/index.js
cotizador-back/src/technicalConsultsDb.js
cotizador-back/src/routes/technicalConsults.routes.js
cotizador-front/src/App.jsx
cotizador-front/src/api/technicalConsults.js
cotizador-front/src/layouts/AppLayout.jsx
cotizador-front/src/pages/TechnicalConsultsPage/index.jsx

Qué hace:
- Botón "Consulta técnica" a la izquierda de Online/Offline.
- Badge llamativo con cantidad sin leer / pendientes.
- Tickets persistentes con mensajes.
- Primera respuesta de Técnica => estado En proceso.
- Cierre solo por Técnica con resolución final obligatoria.
- Ticket cerrado => no admite más respuestas.
- Vista de vendedor/distribuidor y vista de Técnica en una ruta única: /consultas-tecnicas
- Buscador para Técnica por número, asunto, creador, asignado o texto del último mensaje.
- En pestaña Pendientes del técnico, orden de más recientes a más antiguas.
- Al abrir un ticket con mensajes sin leer, se marca como visto aunque esté cerrado.

Copia:
1. Descomprimir respetando carpetas.
2. Copiar cada archivo encima del repo actual.
3. Reiniciar front y back.

Notas:
- El esquema de tablas se crea solo al usar el módulo por primera vez.
- No toqué la pantalla actual de "Revisión Técnica" para no mezclar este flujo con aprobaciones existentes.
- El acceso técnico queda en el mismo botón del header.
