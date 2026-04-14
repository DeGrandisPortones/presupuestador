Fix incluido:
- El precio si estaba entrando al PDF, porque el subtotal/IVA/TOTAL lo incluian.
- El problema era de maquetado en la tabla: columnas chicas y salto de linea en importes largos.
- Se ensancharon las columnas PRECIO c/IVA y TOTAL c/IVA.
- Se desactivo el salto de linea en celdas numericas.
- Se redujo apenas el tamano de fuente de las filas de items.

Archivo:
- cotizador-back/src/routes/pdf.routes.js
