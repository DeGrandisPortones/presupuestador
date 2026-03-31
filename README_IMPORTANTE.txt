CAMBIO: LISTA DE PRECIOS POR DISTRIBUIDOR

Incluye:
- alta de columna odoo_pricelist_id en presupuestador_users
- validación: si el usuario es distribuidor, debe tener lista de precios
- login/me/token con odoo_pricelist_id disponible
- gestor de usuarios con selector de lista de precios traída desde Odoo

IMPORTANTE:
- este paquete deja guardada la lista de precios en el usuario distribuidor
- el selector aparece solo cuando el usuario tiene rol Distribuidor
- cada distribuidor queda con un solo ID de lista de precios
