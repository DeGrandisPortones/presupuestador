Importador de distribuidores
===========================

Este ZIP agrega el script:

  cotizador-back/scripts/import_distribuidores_desde_listado_clientes.mjs

También agrega el comando en cotizador-back/package.json:

  npm run import:distribuidores

Qué hace:
- Crea distribuidores desde listado_clientesMod.xlsx ya convertido dentro del script.
- Si el Excel no tiene usuario, usa la razón social como usuario.
- Si hay usuarios duplicados, genera un usuario único agregando la razón social.
- Asigna vendedor según el nombre cargado en la columna Vendedor.
- Asigna lista Odoo según:
  Lista 2 => 23
  Lista 3 => 24
  Lista 4 => 25
  Lista 5 => 26
  Lista 6 => 27
- Usa la contraseña inicial fija 123456 para todos los distribuidores nuevos.
- No cambia la contraseña de usuarios existentes, salvo que ejecutes con RESET_EXISTING_DISTRIBUTOR_PASSWORDS=true. Si lo ejecutás así, también los deja en 123456.

Nota:
- El Excel trae 7 filas con Lista 1. Como no se informó ID Odoo para Lista 1, esas filas quedan salteadas y el script las reporta.

Mapeo fijo de vendedores usado por el importador:
- Agustin / Agustin DeGrandis => usuario #22
- Marcelo / Marcelo Koncija => usuario #21
- Ornella / Ornella Petetta => usuario #17
- Natalia / Natalia Tabbia => usuario #18
- Ludmila / Ludmila Crotto => usuario #20
- Flavio / Flavio Pelagagge => usuario #23
- Daniel / Daniel Pinto => usuario #24

Esto evita errores por diferencias entre el nombre del Excel y el full_name guardado en Supabase.
