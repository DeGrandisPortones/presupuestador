// PortonDimensions.jsx - HOTFIX PARANTES
// Reemplazá SOLO el useEffect de parantes que empieza con:
//   useEffect(() => {
//     if (!isPorton) return;
//     const patch = {};
//     const currentOrientationRaw = String(dimensions?.orientacion_parantes || "").trim();
//
// y termina con el array de dependencias que incluye:
//   [isPorton, isNonAptoPorton, hasStoredParantesConfig, ...]
//
// por este bloque completo:

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
