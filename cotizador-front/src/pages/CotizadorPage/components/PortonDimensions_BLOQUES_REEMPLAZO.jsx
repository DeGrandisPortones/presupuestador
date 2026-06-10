// PortonDimensions.jsx - BLOQUES DE REEMPLAZO DIRECTO
// No ejecutar. Copiar y pegar los bloques indicados en PortonDimensions.jsx.

// ============================================================
// BLOQUE 1
// Reemplazar desde:
//   const showSpecialParantesDistances = ...
// hasta:
//   const sketchParantesCount = ...;
// ============================================================

  const aptoDoorFixedReference = isPorton && aptoParaRevestir && hasDoorParantesConfig;
  const showSpecialParantesDistances = isPorton && aptoParaRevestir && distribution === "especial";
  const showAptoFixedFirstParanteOption = aptoDoorFixedReference;
  const aptoSimulaHorizontalReferencia = aptoDoorFixedReference;
  const aptoReferenciaLado = String(dimensions?.parantes_referencia_lado || detectedDoorSide || "izquierdo").trim().toLowerCase() === "derecho" ? "derecho" : "izquierdo";
  const aptoReferenciaDistancia = String(dimensions?.parantes_referencia_distancia_mm ?? dimensions?.parantes_primer_parante_distancia_mm ?? "");
  const aptoReferenciaDistanciaMm = Math.max(0, parseMmNumber(aptoReferenciaDistancia) || DOOR_FIXED_PARANTE_DISTANCE_MM);
  const nonAptoDoorFixedReference = isNonAptoPorton && hasDoorParantesConfig;
  const effectiveFixedReference = aptoSimulaHorizontalReferencia || nonAptoDoorFixedReference;
  const effectiveFixedReferenceSide = aptoSimulaHorizontalReferencia ? aptoReferenciaLado : (detectedDoorSide || aptoReferenciaLado);
  const effectiveFixedReferenceDistanceMm = aptoSimulaHorizontalReferencia ? aptoReferenciaDistanciaMm : DOOR_FIXED_PARANTE_DISTANCE_MM;
  const aptoParantesRestantesCount = aptoSimulaHorizontalReferencia ? Math.max(0, parantesCount - 1) : parantesCount;
  const aptoDistributionBaseDimensionMm = aptoSimulaHorizontalReferencia && effectiveParantesOrientation === "verticales"
    ? Math.max(0, baseParantesDimensionMm - aptoReferenciaDistanciaMm)
    : baseParantesDimensionMm;
  const effectiveParantesRestantesCount = effectiveFixedReference ? Math.max(0, parantesCount - 1) : parantesCount;
  const effectiveDistributionBaseDimensionMm = effectiveFixedReference && effectiveParantesOrientation === "verticales"
    ? Math.max(0, baseParantesDimensionMm - effectiveFixedReferenceDistanceMm)
    : baseParantesDimensionMm;
  const resolvedParantesDistances = useMemo(() => {
    const current = normalizeDistanceList(rawParantesDistances);
    const countForDistances = effectiveFixedReference ? effectiveParantesRestantesCount : (showSpecialParantesDistances ? aptoParantesRestantesCount : parantesCount);
    if ((aptoDoorFixedReference && distribution === "repartido") || (showSpecialParantesDistances && distributeUniformly)) {
      return buildResolvedParantesDistances({
        distanceList: [],
        distributeUniformly: true,
        parantesCount: countForDistances,
        baseDimensionMm: effectiveDistributionBaseDimensionMm,
        tubeDiscountMm,
      });
    }
    return padDistanceList(current, countForDistances);
  }, [rawParantesDistances, aptoDoorFixedReference, distribution, showSpecialParantesDistances, distributeUniformly, aptoParantesRestantesCount, parantesCount, effectiveFixedReference, effectiveParantesRestantesCount, effectiveDistributionBaseDimensionMm, tubeDiscountMm]);
  const resolvedDistancesHaveValues = normalizeDistanceList(resolvedParantesDistances).some((item) => {
    const n = parseMmNumber(item);
    return Number.isFinite(n) && n > 0;
  });
  const distancesForFixedReferenceSketch = effectiveFixedReference && !resolvedDistancesHaveValues
    ? buildUniformParantesDistances({
        parantesCount: effectiveParantesRestantesCount,
        baseDimensionMm: effectiveDistributionBaseDimensionMm,
        tubeDiscountMm,
      })
    : resolvedParantesDistances;
  const sketchParantesDistances = effectiveFixedReference
    ? buildFixedReferenceSketchDistances({
        distances: distancesForFixedReferenceSketch,
        orientation: effectiveParantesOrientation,
        fixedDistanceMm: effectiveFixedReferenceDistanceMm,
      })
    : resolvedParantesDistances;
  const sketchParantesCount = effectiveFixedReference ? effectiveParantesRestantesCount : parantesCount;

// ============================================================
// BLOQUE 2
// Reemplazar el useEffect que empieza con:
//   useEffect(() => {
//     if (!isPorton || !aptoParaRevestir || !hasDoorParantesConfig) return;
// ============================================================

  useEffect(() => {
    if (!isPorton || !aptoParaRevestir || !hasDoorParantesConfig) return;
    const fixedEnabled = dimensions?.parantes_primer_parante_distancia_fija === true ||
      String(dimensions?.parantes_primer_parante_distancia_fija || "").trim().toLowerCase() === "true" ||
      dimensions?.parantes_simular_referencia_horizontal === true ||
      String(dimensions?.parantes_simular_referencia_horizontal || "").trim().toLowerCase() === "true";
    const patch = {};
    if (!fixedEnabled) {
      patch.parantes_primer_parante_distancia_fija = true;
      patch.parantes_simular_referencia_horizontal = true;
    }
    if (!String(dimensions?.parantes_referencia_lado || "").trim()) {
      patch.parantes_referencia_lado = detectedDoorSide;
    }
    const currentDistance = String(dimensions?.parantes_referencia_distancia_mm ?? dimensions?.parantes_primer_parante_distancia_mm ?? "").trim();
    if (!currentDistance) {
      patch.parantes_referencia_distancia_mm = String(DOOR_FIXED_PARANTE_DISTANCE_MM);
      patch.parantes_primer_parante_distancia_mm = String(DOOR_FIXED_PARANTE_DISTANCE_MM);
    }
    const currentDistributionRaw = String(dimensions?.distribucion_parantes || "").trim();
    if (!currentDistributionRaw) patch.distribucion_parantes = "repartido";
    if (parantesCount <= 0) patch.cantidad_parantes = String(Math.max(1, autoParantesCount || 1));
    if (Object.keys(patch).length) setDimensions(patch);
  }, [
    isPorton,
    aptoParaRevestir,
    hasDoorParantesConfig,
    detectedDoorSide,
    dimensions?.parantes_primer_parante_distancia_fija,
    dimensions?.parantes_simular_referencia_horizontal,
    dimensions?.parantes_referencia_lado,
    dimensions?.parantes_referencia_distancia_mm,
    dimensions?.parantes_primer_parante_distancia_mm,
    dimensions?.distribucion_parantes,
    parantesCount,
    autoParantesCount,
    setDimensions,
  ]);

// ============================================================
// BLOQUE 3
// Reemplazar el useEffect siguiente que empieza con:
//   useEffect(() => {
//     if (!isPorton) return;
//     const patch = {};
//     const currentOrientationRaw = ...
// y contiene shouldAutoManageNonAptoParantes.
// ============================================================

  useEffect(() => {
    if (!isPorton) return;
    const patch = {};
    const currentOrientationRaw = String(dimensions?.orientacion_parantes || "").trim();
    const currentDistributionRaw = String(dimensions?.distribucion_parantes || "").trim();
    const currentCountRaw = String(dimensions?.cantidad_parantes ?? "").trim();
    const currentCountNumber = getParantesCount(dimensions?.cantidad_parantes);
    const shouldAutoManageNonAptoParantes = isNonAptoPorton && !hasStoredParantesConfig;

    if (shouldAutoManageNonAptoParantes && nonAptoConfiguredOrientation && orientation !== nonAptoConfiguredOrientation) {
      patch.orientacion_parantes = nonAptoConfiguredOrientation;
    } else if (!currentOrientationRaw) {
      patch.orientacion_parantes = "verticales";
    }

    if (shouldAutoManageNonAptoParantes && distribution !== "repartido") {
      patch.distribucion_parantes = "repartido";
    } else if (!currentDistributionRaw) {
      patch.distribucion_parantes = "repartido";
    }

    const nextCount = String(autoParantesCount);
    const shouldUpdateParantesCount = isNonAptoPorton || !currentCountRaw || currentCountNumber <= 0;
    if (shouldUpdateParantesCount && currentCountRaw !== nextCount) {
      patch.cantidad_parantes = nextCount;
    }

    if (Object.keys(patch).length) setDimensions(patch);
  }, [isPorton, isNonAptoPorton, hasStoredParantesConfig, nonAptoConfiguredOrientation, orientation, distribution, autoParantesCount, dimensions?.orientacion_parantes, dimensions?.distribucion_parantes, dimensions?.cantidad_parantes, setDimensions]);

// ============================================================
// BLOQUE 4
// Dentro del bloque {showSpecialParantesDistances ? (...) : null}, reemplazar desde:
//   <label style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 700 }}><input type="checkbox" checked={aptoSimulaHorizontalReferencia} ...
// hasta el cierre del div condicional:
//   </div> : null}
// por esto:
// ============================================================

          <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 10, background: "#ecfdf5", border: "1px solid #bbf7d0", color: "#166534", fontWeight: 800 }}>
            Parante vertical de puerta fijo. Se toma a 825 mm por defecto y se usa como referencia para distribuir el resto.
          </div>
          <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10 }}>
            <FieldBox label="Lado del parante fijo de puerta" helper="Se usa como referencia para distribuir el resto."><select value={aptoReferenciaLado} onChange={(e) => setDimensions({ parantes_referencia_lado: e.target.value })} style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #ddd", background: "#fff" }}><option value="izquierdo">Izquierdo</option><option value="derecho">Derecho</option></select></FieldBox>
            <FieldBox label="Distancia del parante fijo de puerta" helper="Numero en mm desde el lado elegido. Por defecto 825 mm."><Input type="text" inputMode="decimal" value={aptoReferenciaDistancia} onChange={(v) => setDimensions({ parantes_referencia_distancia_mm: normalizeDecimalMmInput(v), parantes_primer_parante_distancia_mm: normalizeDecimalMmInput(v) })} onBlur={(e) => { const next = normalizeDecimalMmInput(e?.target?.value) || String(DOOR_FIXED_PARANTE_DISTANCE_MM); setDimensions({ parantes_referencia_distancia_mm: next, parantes_primer_parante_distancia_mm: next }); }} placeholder="Ej: 825" style={{ width: "100%" }} /></FieldBox>
          </div>

