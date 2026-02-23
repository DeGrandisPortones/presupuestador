BACK (fix tuple index out of range en Odoo)

En: cotizador-back/src/routes/quotes.routes.js
Dentro de findOrCreateCustomerPartner(), corregí el dominio de search (tiene corchetes de más).

ANTES:
  odoo.executeKw("res.partner", "search", [[[[ "email", "=", customer.email ]]]], { limit: 1 })
  odoo.executeKw("res.partner", "search", [[[[ "name",  "=", customer.name  ]]]], { limit: 1 })

DESPUÉS (correcto):
  odoo.executeKw("res.partner", "search", [[["email", "=", customer.email]]], { limit: 1 })
  odoo.executeKw("res.partner", "search", [[["name",  "=", customer.name ]]], { limit: 1 })

Reiniciar backend y reintentar aprobar.
