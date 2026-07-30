function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function haversineDistance(start, end) {
  if (!start || !end) return 0;
  const earthRadiusKm = 6371;
  const lat1 = toRadians(start.lat);
  const lat2 = toRadians(end.lat);
  const deltaLat = toRadians(end.lat - start.lat);
  const deltaLng = toRadians(end.lng - start.lng);

  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
}

export function calculateRouteDistanceKm(route = []) {
  return route.reduce((total, point, index) => {
    if (index === 0) return total;
    return total + haversineDistance(route[index - 1], point);
  }, 0);
}

export function interpolateRoutePosition(route = [], progressFraction = 0) {
  const safeRoute = Array.isArray(route) && route.length ? route : [];
  if (!safeRoute.length) {
    return { lat: 0, lng: 0 };
  }

  const clampedProgress = clamp(progressFraction, 0, 1);
  const segmentCount = Math.max(1, safeRoute.length - 1);
  const scaledIndex = clampedProgress * segmentCount;
  const currentIndex = Math.min(Math.floor(scaledIndex), segmentCount - 1);
  const nextIndex = Math.min(currentIndex + 1, segmentCount);
  const segmentProgress = scaledIndex - currentIndex;

  const startPoint = safeRoute[currentIndex];
  const endPoint = safeRoute[nextIndex] ?? safeRoute[currentIndex];

  if (!startPoint || !endPoint) {
    return { lat: 0, lng: 0 };
  }

  return {
    lat: startPoint.lat + (endPoint.lat - startPoint.lat) * segmentProgress,
    lng: startPoint.lng + (endPoint.lng - startPoint.lng) * segmentProgress,
  };
}

export function createSimulationState(shipment, options = {}) {
  const route = options.route ?? shipment.route ?? [];
  const routeDistanceKm = options.routeDistanceKm ?? calculateRouteDistanceKm(route);
  const etaHours = options.etaHours ?? Math.max(3, routeDistanceKm / 750);
  const averageSpeedKmh = options.averageSpeedKmh ?? (routeDistanceKm / Math.max(etaHours, 0.01));

  return {
    trackingNumber: shipment.trackingNumber,
    mode: options.mode ?? 'realtime',
    etaHours: Number(etaHours),
    progressFraction: clamp(Number(options.progressFraction ?? 0), 0, 1),
    lastUpdatedAt: options.lastUpdatedAt ?? Date.now(),
    startedAt: options.startedAt ?? Date.now(),
    isDelayed: Boolean(options.isDelayed),
    destination: options.destination ?? route[route.length - 1] ?? null,
    route,
    routeDistanceKm: Number(routeDistanceKm),
    averageSpeedKmh: Number(averageSpeedKmh),
  };
}

export function tickSimulation(state, now = Date.now()) {
  if (!state) return state;
  if (state.isDelayed) {
    return {
      ...state,
      lastUpdatedAt: now,
    };
  }

  const elapsedMs = Math.max(0, now - (state.lastUpdatedAt ?? now));
  const elapsedHours = state.mode === 'preview'
    ? (elapsedMs / 1000) / 90 * state.etaHours
    : elapsedMs / 3_600_000;

  const nextProgress = clamp((state.progressFraction ?? 0) + elapsedHours / Math.max(state.etaHours, 0.01), 0, 1);

  return {
    ...state,
    progressFraction: nextProgress,
    lastUpdatedAt: now,
  };
}

export function getSimulationSnapshot(shipment, state, now = Date.now()) {
  const simulation = state ?? createSimulationState(shipment, { progressFraction: 0 });
  const progressFraction = clamp(simulation.progressFraction ?? 0, 0, 1);
  const position = interpolateRoutePosition(simulation.route ?? shipment.route ?? [], progressFraction);
  const remainingEtaHours = Math.max(0, simulation.etaHours * (1 - progressFraction));
  const status = simulation.isDelayed
    ? 'delayed'
    : progressFraction >= 1
      ? 'delivered'
      : progressFraction >= 0.9
        ? 'out_for_delivery'
        : progressFraction > 0
          ? 'in_transit'
          : 'pending';

  return {
    status,
    progressFraction,
    remainingEtaHours,
    position,
    mode: simulation.mode,
    isDelayed: Boolean(simulation.isDelayed),
    etaHours: Number(simulation.etaHours),
    averageSpeedKmh: Number(simulation.averageSpeedKmh ?? 0),
    updatedAt: now,
  };
}

export function rerouteSimulation(state, destination, currentPosition, now = Date.now()) {
  if (!state) return state;
  const fromPosition = currentPosition ?? interpolateRoutePosition(state.route ?? [], state.progressFraction ?? 0);
  const remainingDistanceKm = haversineDistance(fromPosition, destination);
  const averageSpeedKmh = Number(state.averageSpeedKmh ?? Math.max(state.routeDistanceKm / Math.max(state.etaHours, 0.01), 1));
  const remainingEtaHours = Math.max(0.25, remainingDistanceKm / Math.max(averageSpeedKmh, 1));

  return {
    ...state,
    route: [fromPosition, destination],
    destination,
    progressFraction: 0,
    etaHours: Number(remainingEtaHours),
    remainingEtaHours: Number(remainingEtaHours),
    lastUpdatedAt: now,
    startedAt: now,
  };
}

export function deriveStatus(simulationState) {
  return getSimulationSnapshot(null, simulationState, Date.now()).status;
}
