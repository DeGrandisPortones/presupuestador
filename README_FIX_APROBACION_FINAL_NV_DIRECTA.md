# Fix aprobación final NV directa

Corrige dos problemas al aprobar el circuito técnico final de un portón a producción sin medición:

- `adminGetTechnicalMeasurementRules` ya no recibe el objeto de React Query como `kind`, evitando `/api/admin/technical-measurement-rules?kind=[object Object]`.
- El backend permite aprobar desde Técnica un portón `tecnica_only` / `sin_medicion` con `measurement_status='pending'`. En ese caso se aprueba el circuito final, dispara WhatsApp y `measurementFinalization` no crea otra NV porque la NV inicial ya existe.
