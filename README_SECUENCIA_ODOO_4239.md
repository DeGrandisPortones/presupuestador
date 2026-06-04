# Secuencia independiente para NP/NV/ONP/ONV/PNP/PNV/INP/INV/PLNP/PLNV

Este paquete separa la numeracion interna del presupuesto (`quote_number`) de la numeracion de ordenes Odoo.

## Nuevo comportamiento

- El numero de presupuesto sigue usando `presupuestador_quote_number_seq`.
- Las ordenes Odoo usan una secuencia nueva: `public.presupuestador_odoo_reference_seq`.
- La secuencia Odoo arranca en 4239.
- La secuencia se consume recien al crear la orden en Odoo, cuando el presupuesto queda aprobado y sincroniza.
- Todos los prefijos comparten la misma secuencia numerica:
  - NP / NV
  - ONP / ONV
  - PNP / PNV
  - INP / INV
  - PLNP / PLNV

Ejemplos:

- Primer porton produccion directo: NV4239
- Siguiente porton acopio: NP4240
- Siguiente plegado produccion: PLNV4241
- Siguiente ipanel acopio: INP4242

## Hardcodes existentes

Los 5 `quote_id` migrados siguen forzados y no consumen la secuencia nueva:

- NV4238
- NV4237
- NP4236
- NV4235
- NV4231

## Archivos modificados

- `cotizador-back/src/routes/quotes.routes.js`
- `cotizador-back/src/quotesSchema.js`

## Validacion hecha

Se valido sintaxis con:

```bash
node --check cotizador-back/src/routes/quotes.routes.js
node --check cotizador-back/src/quotesSchema.js
```

## Consulta para ver la secuencia en Supabase

```sql
select last_value, is_called
from public.presupuestador_odoo_reference_seq;
```

Si `is_called = false`, el proximo numero sera `last_value`.
Si `is_called = true`, el proximo numero sera `last_value + 1`.


## Corrección acopio -> venta final

Cuando un presupuesto en acopio ya generó una NP, la venta final reutiliza el mismo número y cambia sólo el prefijo:

- `NP4240` -> `NV4240`
- `INP4241` -> `INV4241`
- `PLNP4242` -> `PLNV4242`
- `PNP4243` -> `PNV4243`
- `ONP4244` -> `ONV4244`

La secuencia única se consume al crear una nueva NP/NV inicial. La NV final derivada de una NP existente no consume otro número.
