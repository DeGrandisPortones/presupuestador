ZIP LISTO PARA REEMPLAZAR ARCHIVOS

Incluye estos cambios:
- Envío del vendedor a Odoo en sale.order usando x_studio_vendedor
- Si x_studio_vendedor fuera many2one a hr.employee, intenta buscar por nombre
- Corrección del error de fórmula de puerta
- En presupuesto y proforma deja solo Vendedor y Obs en la franja extra
- Mantiene los cambios de flujo/pantallas que ya te venía armando

Como aplicarlo:
1. Descomprimí el zip.
2. Copiá y pegá cada carpeta sobre tu repo presupuestador.
3. Hacé deploy.

Notas:
- Como ya creaste x_studio_vendedor, no hace falta agregar ninguna variable de entorno.
- Si en Odoo ese campo es texto/char, guarda el nombre del vendedor.
- Si en Odoo ese campo es many2one a empleado, busca el empleado por nombre.
