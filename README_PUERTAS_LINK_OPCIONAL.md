# Puertas: vínculo opcional con advertencia al confirmar

Copiar y reemplazar sobre la raíz del repositorio. No requiere comandos ni SQL.

Cambio incluido:
- El vínculo con portón sigue siendo opcional.
- Al confirmar una puerta sin portón vinculado, muestra un `confirm`:
  "Esta puerta no está vinculada a ningún portón. ¿Deseás continuar igual?"
- Si el usuario acepta, continúa el flujo normal de confirmación.
- Si el usuario cancela, no confirma y vuelve al presupuesto para seguir editando.
