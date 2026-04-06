# Patch manual · `cotizador-front/src/pages/SuperuserMeasurementRulesPage/index.jsx`

Aplicar estos cambios sobre la pantalla actual para poder editar la propiedad nueva:

## 1. En `newField(...)`
Agregar:

```js
send_modification_to_commercial: false,
```

## 2. En `normalizeFieldDraft(...)`
Agregar:

```js
send_modification_to_commercial:
  field?.send_modification_to_commercial === true,
```

## 3. En el payload de `adminSaveTechnicalMeasurementFieldDefinitions`
Agregar dentro de cada campo:

```js
send_modification_to_commercial:
  field.send_modification_to_commercial === true,
```

## 4. En la tarjeta de cada campo, junto a “Obligatorio” / “Activo”
Agregar otro checkbox:

```jsx
<label style={{ display: "flex", gap: 8, alignItems: "center" }}>
  <input
    type="checkbox"
    checked={field.send_modification_to_commercial === true}
    onChange={(e) =>
      updateFieldAt(setFieldDraft, index, {
        send_modification_to_commercial: e.target.checked,
      })
    }
  />
  <span className="muted">Envía modificación a comercial</span>
</label>
```

## 5. En el bloque explicativo del campo
Sumar una aclaración textual:

> Si este flag está activo y el medidor cambia el valor respecto del valor base, la medición se frena en revisión comercial antes de pasar a técnica.

## 6. No olvidar
El archivo `cotizador-front/src/domain/measurement/technicalMeasurementRuleFields.js`
ya quedó preparado para leer y mergear esta propiedad.
