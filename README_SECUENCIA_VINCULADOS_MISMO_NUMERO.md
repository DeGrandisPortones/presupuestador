# Secuencia Odoo - vinculados a porton reutilizan numero

Cambio aplicado sobre `cotizador-back/src/routes/quotes.routes.js`.

## Regla

Si un presupuesto de Ipanel, Puerta, Otros o Plegados esta vinculado a un porton, no consume un nuevo numero de la secuencia Odoo. Reutiliza el numero Odoo del porton vinculado y cambia solo la sigla.

Ejemplos:

- Porton `NP4239` + Ipanel acopio => `INP4239`
- Porton `NV4239` + Ipanel produccion => `INV4239`
- Porton `NP4240` + Puerta acopio => `PNP4240`
- Porton `NP4241` + Plegados acopio => `PLNP4241`
- Porton `NV4242` + Otros produccion => `ONV4242`

## Seguridad

Si el presupuesto hijo esta vinculado a un porton pero el porton todavia no tiene NP/NV generada en Odoo, el backend devuelve error y no consume la secuencia. Primero debe aprobarse/sincronizarse el porton vinculado.

## Hardcodes existentes

Los 5 hardcodes existentes se mantienen con prioridad por `quote_id`.
