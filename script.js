import { shipments as baseShipments } from './data.js';
import {
  calculateRouteDistanceKm,
  createSimulationState,
  getSimulationSnapshot,
  rerouteSimulation,
  tickSimulation,
} from './simulation.js';
import { formatNow, getQueryParam, statusLabel, statusClass, renderEventItem, sortShipments } from './app.js';

const STORAGE_KEY = 'Swiftlane Logistics-simulation-state-v1';

const state = {
  activeShipment: null,
  eventTimer: null,
  sortField: 'status',
  sortDirection: 'asc',
  map: null,
  mapMarkers: [],
  routeLayers: [],
  shipments: [],
};

const statusOrder = { pending: 1, in_transit: 2, out_for_delivery: 3, delivered: 4, delayed: 5 };

// Set window.SWIFTLANE_API_BASE_URL in your frontend HTML when the backend is hosted separately.
// Example for Vercel frontend + Render backend:
// <script>window.SWIFTLANE_API_BASE_URL = 'https://your-render-app.onrender.com'</script>
const API_BASE_URL = (window.SWIFTLANE_API_BASE_URL || '').replace(/\/+$|^\s+|\s+$/g, '');

function apiUrl(path) {
  return API_BASE_URL ? `${API_BASE_URL}${path}` : path;
}

const uaeDestinations = [
  { value: 'Dubai Creek Harbor', name: 'Dubai Creek Harbor', lat: 25.2769, lng: 55.325 },
  { value: 'Deira City Centre', name: 'Deira City Centre', lat: 25.2664, lng: 55.3334 },
  { value: 'Sharjah Freight City', name: 'Sharjah Freight City', lat: 25.2736, lng: 55.3874 },
  { value: 'Al Ain Mall', name: 'Al Ain Mall', lat: 24.1302, lng: 55.8023 },
  { value: 'Jumeirah Beach Road', name: 'Jumeirah Beach Road', lat: 25.1849, lng: 55.2365 },
];

function formatUpdatedLabel(ship) {
  return formatNow(ship.lastUpdate);
}

function getInitialProgressForStatus(status) {
  switch (status) {
    case 'delivered': return 1;
    case 'out_for_delivery': return 0.8;
    case 'in_transit': return 0.35;
    case 'delayed': return 0.45;
    default: return 0;
  }
}

function estimateEtaHours(route = []) {
  const distanceKm = calculateRouteDistanceKm(route);
  return Math.max(4, Number((distanceKm / 750).toFixed(1)));
}

function serializeShipmentForSave(shipment) {
  return {
    trackingNumber: shipment.trackingNumber,
    sender: shipment.sender,
    receiver: shipment.receiver,
    riderName: shipment.riderName,
    status: shipment.status,
    lastUpdate: shipment.lastUpdate,
    route: shipment.route,
    events: shipment.events,
    simulation: shipment.simulation,
  };
}

async function saveShipmentsToServer() {
  try {
    const payload = state.shipments.map(serializeShipmentForSave);
    await fetch(apiUrl('/api/shipments'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    console.error('Unable to save shipment data to server:', error);
  }
}

function buildRuntimeShipments(sourceShipments) {
  return sourceShipments.map((shipment) => {
    const route = shipment.route || [];
    const destination = shipment.destination || route[route.length - 1] || shipment.route[shipment.route.length - 1];
    const progressFraction = shipment.simulation?.progressFraction ?? getInitialProgressForStatus(shipment.status);
    const isDelayed = shipment.simulation?.isDelayed ?? shipment.status === 'delayed';
    const simulation = createSimulationState(shipment, {
      route,
      destination,
      etaHours: estimateEtaHours(route),
      progressFraction,
      mode: shipment.simulation?.mode ?? 'realtime',
      isDelayed,
      lastUpdatedAt: shipment.simulation?.lastUpdatedAt ?? Date.now(),
      startedAt: shipment.simulation?.startedAt ?? Date.now(),
    });
    const snapshot = getSimulationSnapshot(shipment, simulation, Date.now());
    return {
      ...shipment,
      simulation,
      snapshot,
      status: snapshot.status,
      lastUpdate: shipment.lastUpdate || new Date().toISOString(),
    };
  });
}

function hydrateRuntimeShipments(sourceShipments = baseShipments) {
  state.shipments = buildRuntimeShipments(sourceShipments);
  return state.shipments;
}

async function loadShipmentsFromServer() {
  try {
    const response = await fetch(apiUrl('/api/shipments'));
    if (!response.ok) throw new Error('Failed to load shipments');
    const shipments = await response.json();
    return shipments;
  } catch (error) {
    console.warn('Server shipment load failed, using local data:', error);
    return null;
  }
}

function syncShipments(now = Date.now()) {
  if (!state.shipments.length) {
    hydrateRuntimeShipments();
  }

  state.shipments = state.shipments.map((shipment) => {
    const mergedSimulation = {
      ...shipment.simulation,
      route: shipment.simulation.route,
    };
    const nextSimulation = tickSimulation(mergedSimulation, now);
    const snapshot = getSimulationSnapshot(shipment, nextSimulation, now);

    return {
      ...shipment,
      simulation: nextSimulation,
      snapshot,
      status: snapshot.status,
      lastUpdate: new Date(now).toISOString(),
    };
  });

  return state.shipments;
}

function findShipmentByTracking(trackingNumber) {
  return state.shipments.find((item) => item.trackingNumber === trackingNumber) || null;
}

function findShipmentByQuery(query) {
  const normalized = String(query || '').trim().toUpperCase();
  const lookupShipments = state.shipments.length ? state.shipments : baseShipments;
  if (!normalized) return null;

  let match = lookupShipments.find((item) => String(item.trackingNumber).toUpperCase() === normalized);
  if (match) return match;
  match = lookupShipments.find((item) => String(item.trackingNumber).toUpperCase().endsWith(normalized));
  if (match) return match;
  match = lookupShipments.find((item) => String(item.trackingNumber).toUpperCase().includes(normalized));
  if (match) return match;

  const digits = String(query || '').replace(/\D/g, '');
  if (digits) {
    match = lookupShipments.find((item) => String(item.trackingNumber).replace(/\D/g, '').endsWith(digits));
  }
  return match || null;
}

function renderHeroImage() {
  return `
    <div class="hero-visual" aria-hidden="true">
      <svg viewBox="0 0 520 360" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="heroGlow" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#ff8b44" stop-opacity="0.95" />
            <stop offset="100%" stop-color="#ff4f82" stop-opacity="0.35" />
          </linearGradient>
        </defs>
        <rect width="520" height="360" rx="32" fill="#eef4fb" />
        <path d="M104 248 h312 v24 a16 16 0 0 1 -16 16 h-280 a16 16 0 0 1 -16 -16 z" fill="#d7e9ff" />
        <path d="M124 140 h272 v92 h-272 z" fill="#ffffff" stroke="#dbe7f2" stroke-width="4" />
        <path d="M136 126 h64 v24 h-64 z" fill="#ff8b44" />
        <path d="M140 176 h40 v32 h-40 z" fill="#ff4f82" />
        <path d="M344 186 h44 v24 h-44 z" fill="#111827" opacity="0.08" />
        <circle cx="392" cy="250" r="28" fill="url(#heroGlow)" opacity="0.65" />
        <path d="M188 182 h220 v28 h-220 z" fill="#8fbdf7" opacity="0.9" />
        <path d="M286 180 l40 -28 l24 26" fill="none" stroke="#fff" stroke-width="8" stroke-linecap="round" />
        <path d="M118 228 h88 v24 h-88 z" fill="#fff" opacity="0.9" />
      </svg>
    </div>
  `;
}

function buildStatCards() {
  const shipments = syncShipments(Date.now());
  const total = shipments.length;
  const inTransit = shipments.filter((item) => item.status === 'in_transit').length;
  const delivered = shipments.filter((item) => item.status === 'delivered').length;
  const delayed = shipments.filter((item) => item.status === 'delayed').length;
  return { total, inTransit, delivered, delayed };
}

function renderDashboard() {
  const cardData = buildStatCards();
  const statsToday = document.getElementById('stats-today');
  const statsInTransit = document.getElementById('stats-in-transit');
  const statsDelivered = document.getElementById('stats-delivered');
  const statsDelayed = document.getElementById('stats-delayed');
  if (statsToday) statsToday.textContent = cardData.total;
  if (statsInTransit) statsInTransit.textContent = cardData.inTransit;
  if (statsDelivered) statsDelivered.textContent = cardData.delivered;
  if (statsDelayed) statsDelayed.textContent = cardData.delayed;

  const heroImage = document.getElementById('hero-visual-container');
  if (heroImage) heroImage.innerHTML = renderHeroImage();

  renderShipmentTable();
  attachTableSorting();
}

function renderShipmentTable() {
  const body = document.getElementById('table-body');
  if (!body) return;
  const sorted = sortShipments(state.shipments, state.sortField, state.sortDirection);
  const headers = ['Tracking', 'Sender', 'Receiver', 'Status', 'Rider', 'Last update'];
  body.innerHTML = sorted
    .map((shipment) => {
      const cols = [
        shipment.trackingNumber,
        shipment.sender,
        shipment.receiver,
        `<span class="${statusClass(shipment.status)}">${statusLabel(shipment.status)}</span>`,
        shipment.riderName,
        formatUpdatedLabel(shipment),
      ];
      const tds = cols.map((c, i) => `<td data-label="${headers[i]}">${c}</td>`).join('');
      return `<tr data-href="details.html?id=${shipment.trackingNumber}">${tds}</tr>`;
    })
    .join('');

  body.querySelectorAll('tr[data-href]').forEach((row) => {
    row.addEventListener('click', () => {
      window.location.href = row.dataset.href;
    });
  });
}

function attachTableSorting() {
  const headers = document.querySelectorAll('[data-sort]');
  headers.forEach((header) => {
    header.onclick = () => {
      const field = header.dataset.sort;
      if (state.sortField === field) {
        state.sortDirection = state.sortDirection === 'asc' ? 'desc' : 'asc';
      } else {
        state.sortField = field;
        state.sortDirection = 'asc';
      }
      renderShipmentTable();
    };
  });
}

function updateActiveShipmentView() {
  if (!state.activeShipment) return;
  const shipment = findShipmentByTracking(state.activeShipment.trackingNumber);
  if (!shipment) return;
  state.activeShipment = shipment;
  const snapshot = shipment.snapshot;
  const elOrder = document.getElementById('details-order');
  const elStatus = document.getElementById('details-status');
  const elFrom = document.getElementById('details-from');
  const elTo = document.getElementById('details-to');
  const elRider = document.getElementById('details-rider');
  const elUpdated = document.getElementById('details-updated');
  if (elOrder) elOrder.textContent = shipment.trackingNumber;
  if (elStatus) elStatus.innerHTML = `<span class="${statusClass(snapshot.status)}">${statusLabel(snapshot.status)}</span>`;
  if (elFrom) elFrom.textContent = shipment.sender;
  if (elTo) elTo.textContent = shipment.receiver;
  if (elRider) elRider.textContent = shipment.riderName;
  if (elUpdated) elUpdated.textContent = formatUpdatedLabel(shipment);
  renderRouteList();
  renderTimeline(Math.min(shipment.events.length - 1, Math.max(0, Math.floor(snapshot.progressFraction * shipment.events.length))));
  const bar = document.getElementById('timeline-progress');
  if (bar) bar.style.width = `${Math.round(snapshot.progressFraction * 100)}%`;
}

function initTrackingPage(matchedShipment = null) {
  let shipment = matchedShipment || null;
  const trackingId = getQueryParam('id');

  if (!shipment) {
    shipment = trackingId ? findShipmentByTracking(trackingId) : null;
  }

  if (!shipment) {
    if (trackingId) return renderMissingShipment();
    shipment = state.shipments.find((item) => item.status !== 'delivered') || state.shipments[0];
    if (shipment) window.history.replaceState(null, '', `details.html?id=${shipment.trackingNumber}`);
  }

  if (!shipment) return renderMissingShipment();

  state.activeShipment = shipment;
  document.title = `Swiftlane Logistics - ${shipment.trackingNumber}`;
  updateActiveShipmentView();
  startTimelinePlayback();
}

function renderRouteList() {
  const list = document.getElementById('routes-list');
  if (!list || !state.activeShipment) return;
  list.innerHTML = state.activeShipment.simulation.route
    .map((stop) => `<li>${stop.name || `${stop.lat.toFixed(2)}, ${stop.lng.toFixed(2)}`}</li>`)
    .join('');
}

function renderTimeline(activeIndex) {
  const list = document.getElementById('timeline-list');
  if (!list || !state.activeShipment) return;
  list.innerHTML = state.activeShipment.events
    .map((event, index) => renderEventItem(event, index <= activeIndex))
    .join('');
}

function startTimelinePlayback() {
  if (!state.activeShipment) return;
  if (state.eventTimer) window.clearInterval(state.eventTimer);
  state.eventTimer = window.setInterval(() => {
    const shipments = syncShipments(Date.now());
    const active = shipments.find((item) => item.trackingNumber === state.activeShipment?.trackingNumber);
    if (active) {
      state.activeShipment = active;
      updateActiveShipmentView();
    }
  }, 1000);
}

function renderMissingShipment() {
  const main = document.querySelector('main');
  if (main) main.innerHTML = '<section class="panel"><h2>Shipment not found</h2><p>Check the tracking link or return to the dashboard.</p></section>';
}

function clearMapData() {
  if (state.mapMarkers && state.mapMarkers.length) {
    state.mapMarkers.forEach((m) => { try { state.map.removeLayer(m); } catch (e) {} });
  }
  if (state.routeLayers && state.routeLayers.length) {
    state.routeLayers.forEach((r) => { try { state.map.removeLayer(r); } catch (e) {} });
  }
  state.mapMarkers = [];
  state.routeLayers = [];
}

function initLiveMapPage(matchedShipment = null) {
  const mapContainer = document.getElementById('live-map');
  if (!mapContainer) return;
  if (typeof L === 'undefined') {
    const fallback = document.getElementById('map-fallback');
    if (fallback) fallback.classList.remove('hidden');
    return;
  }

  if (!state.map) {
    state.map = L.map('live-map', { zoomControl: false }).setView([25.0, 55.2], 5);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '© OpenStreetMap contributors • CARTO',
    }).addTo(state.map);
  } else {
    state.map.setView([25.0, 55.2], 5);
    clearMapData();
  }

  renderLiveRiders(matchedShipment);
  window.clearInterval(state.mapTimer);
  state.mapTimer = window.setInterval(() => {
    const shipments = syncShipments(Date.now());
    const selected = matchedShipment ? shipments.find((item) => item.trackingNumber === matchedShipment.trackingNumber) : null;
    renderLiveRiders(selected || null);
  }, 1000);
}

function getColorForStatus(status) {
  return {
    pending: '#f59e0b',
    in_transit: '#38bdf8',
    out_for_delivery: '#10b981',
    delivered: '#22c55e',
    delayed: '#ef4444',
  }[status] ?? '#94a3b8';
}

function createRiderIcon(status, label) {
  const color = getColorForStatus(status);
  return L.divIcon({
    className: 'rider-marker',
    html: `<div style="border-color:${color}; background: rgba(255,255,255,0.06);"><span style="color:${color};">${label}</span></div>`,
    iconSize: [110, 40],
    iconAnchor: [55, 20],
  });
}

function renderLiveRiders(matchedShipment = null) {
  if (!state.map) return;
  clearMapData();
  const sidebar = document.getElementById('rider-list');
  const activeShipments = matchedShipment
    ? [findShipmentByTracking(matchedShipment.trackingNumber)].filter(Boolean)
    : state.shipments.filter((item) => item.status !== 'pending');

  if (sidebar) sidebar.innerHTML = activeShipments
    .map((shipment, index) => `
      <button class="rider-item" data-index="${index}">
        <div>
          <strong>${shipment.riderName}</strong>
          <span>${statusLabel(shipment.status)}</span>
        </div>
        <small>${shipment.receiver.replace(', UAE', '')}</small>
      </button>
    `)
    .join('');

  activeShipments.forEach((shipment) => {
    const snapshot = shipment.snapshot;
    const marker = L.marker([snapshot.position.lat, snapshot.position.lng], {
      icon: createRiderIcon(shipment.status, shipment.riderName.split(' ')[0]),
    }).addTo(state.map);
    state.mapMarkers.push(marker);
    const routeLine = L.polyline((shipment.simulation.route || shipment.route).map((stop) => [stop.lat, stop.lng]), {
      color: getColorForStatus(shipment.status),
      weight: 4,
      opacity: 0.65,
    }).addTo(state.map);
    state.routeLayers.push(routeLine);
  });

  const trackAnother = document.getElementById('track-another');
  if (trackAnother) {
    if (matchedShipment) {
      trackAnother.classList.remove('hidden');
    } else {
      trackAnother.classList.add('hidden');
    }
  }

  document.querySelectorAll('.rider-item').forEach((button) => {
    button.addEventListener('click', () => {
      const index = Number(button.dataset.index);
      const shipment = activeShipments[index];
      if (!shipment) return;
      const position = shipment.snapshot.position;
      state.map.flyTo([position.lat, position.lng], 8, { duration: 1.1 });
      document.querySelectorAll('.rider-item').forEach((item) => item.classList.remove('selected'));
      button.classList.add('selected');
    });
  });
}

function initControlPage() {
  const select = document.getElementById('control-select');
  const statusSelect = document.getElementById('control-status');
  const destinationSelect = document.getElementById('control-destination');
  const modeSelect = document.getElementById('control-mode');
  const notes = document.getElementById('control-notes');
  const details = document.getElementById('control-details');
  if (!select || !statusSelect || !destinationSelect || !modeSelect || !notes || !details) return;

  select.innerHTML = state.shipments
    .map((shipment) => `<option value="${shipment.trackingNumber}">${shipment.trackingNumber} • ${shipment.riderName}</option>`)
    .join('');

  destinationSelect.innerHTML = uaeDestinations
    .map((item) => `<option value="${item.value}">${item.name}</option>`)
    .join('');

  statusSelect.innerHTML = [
    { value: 'active', label: 'Active' },
    { value: 'delayed', label: 'Delayed' },
  ]
    .map((item) => `<option value="${item.value}">${item.label}</option>`)
    .join('');

  modeSelect.innerHTML = [
    { value: 'realtime', label: 'Real-time' },
    { value: 'preview', label: 'Fast preview' },
  ]
    .map((item) => `<option value="${item.value}">${item.label}</option>`)
    .join('');

  const renderControlDetail = () => {
    const shipment = findShipmentByTracking(select.value);
    if (!shipment) return;
    const snapshot = shipment.snapshot;
    const destination = shipment.simulation.destination || shipment.route[shipment.route.length - 1];
    details.innerHTML = `
      <p><strong>Rider:</strong> ${shipment.riderName}</p>
      <p><strong>Status:</strong> <span class="${statusClass(snapshot.status)}">${statusLabel(snapshot.status)}</span></p>
      <p><strong>Live position:</strong> ${snapshot.position.lat.toFixed(2)}, ${snapshot.position.lng.toFixed(2)}</p>
      <p><strong>ETA:</strong> ${snapshot.remainingEtaHours.toFixed(1)} hours remaining</p>
      <p><strong>Destination:</strong> ${destination?.name || shipment.receiver}</p>
      <p><strong>Updated:</strong> ${formatUpdatedLabel(shipment)}</p>
    `;
    statusSelect.value = shipment.simulation.isDelayed ? 'delayed' : 'active';
    modeSelect.value = shipment.simulation.mode;
  };

  select.addEventListener('change', renderControlDetail);
  renderControlDetail();

  document.getElementById('control-update-btn').addEventListener('click', async () => {
    const shipment = findShipmentByTracking(select.value);
    if (!shipment) return;

    shipment.simulation.isDelayed = statusSelect.value === 'delayed';
    shipment.simulation.mode = modeSelect.value;

    const destinationOption = uaeDestinations.find((item) => item.value === destinationSelect.value);
    if (destinationOption) {
      const currentPosition = shipment.snapshot.position;
      const rerouted = rerouteSimulation(shipment.simulation, destinationOption, currentPosition, Date.now());
      if (rerouted.route?.[1] && !rerouted.route[1].name) {
        rerouted.route[1] = { ...rerouted.route[1], name: 'Current location' };
      }
      shipment.simulation = rerouted;
      shipment.simulation.mode = modeSelect.value;
      shipment.simulation.isDelayed = statusSelect.value === 'delayed';
      shipment.simulation.destination = destinationOption;
      shipment.route = shipment.simulation.route;
      shipment.receiver = `${destinationOption.name}, UAE`;
      shipment.events = shipment.events.map((event) => {
        if (['out_for_delivery', 'delayed', 'delivered'].includes(event.key)) {
          return { ...event, meta: destinationOption.name };
        }
        return event;
      });
      shipment.snapshot = getSimulationSnapshot(shipment, shipment.simulation, Date.now());
      shipment.status = shipment.snapshot.status;
      shipment.lastUpdate = new Date().toISOString();
      notes.textContent = `Rerouted to ${destinationOption.name} with ${shipment.snapshot.remainingEtaHours.toFixed(1)}h remaining.`;
    } else {
      shipment.simulation.lastUpdatedAt = Date.now();
      shipment.snapshot = getSimulationSnapshot(shipment, shipment.simulation, Date.now());
      shipment.status = shipment.snapshot.status;
      shipment.lastUpdate = new Date().toISOString();
      notes.textContent = `Simulation updated to ${statusLabel(shipment.status)}.`;
    }

    await saveShipmentsToServer();
    renderControlDetail();
  });

  document.getElementById('control-reset-btn').addEventListener('click', async () => {
    const shipment = findShipmentByTracking(select.value);
    if (!shipment) return;
    shipment.simulation = createSimulationState(shipment, {
      route: shipment.route,
      destination: shipment.route[shipment.route.length - 1],
      etaHours: shipment.simulation.etaHours,
      progressFraction: 0,
      mode: shipment.simulation.mode,
      isDelayed: false,
      lastUpdatedAt: Date.now(),
      startedAt: Date.now(),
    });
    shipment.snapshot = getSimulationSnapshot(shipment, shipment.simulation, Date.now());
    shipment.status = shipment.snapshot.status;
    shipment.lastUpdate = new Date().toISOString();
    await saveShipmentsToServer();
    notes.textContent = 'Shipment reset to its starting point.';
    renderControlDetail();
  });
}

function renderLiveMapSummary() {
  const activeCount = state.shipments.filter((item) => item.status !== 'delivered').length;
  const onRouteCount = state.shipments.filter((item) => ['in_transit', 'out_for_delivery'].includes(item.status)).length;
  const delayedCount = state.shipments.filter((item) => item.status === 'delayed').length;

  const activeEl = document.getElementById('active-riders-count');
  const onRouteEl = document.getElementById('onroute-count');
  const delayedEl = document.getElementById('delayed-count');

  if (activeEl) activeEl.textContent = String(activeCount);
  if (onRouteEl) onRouteEl.textContent = String(onRouteCount);
  if (delayedEl) delayedEl.textContent = String(delayedCount);
}

function initMapSearch() {
  const searchScreen = document.getElementById('search-screen');
  const mapShell = document.querySelector('.map-shell');
  if (!searchScreen || !mapShell) return;

  renderLiveMapSummary();

  const input = document.getElementById('search-input');
  const btn = document.getElementById('search-btn');
  const error = document.getElementById('search-error');
  const trackAnother = document.getElementById('track-another');

  const normalize = (s) => String(s || '').trim().toUpperCase();

  function showError(msg) {
    if (error) error.textContent = msg;
  }

  function resetToSearch() {
    clearMapData();
    if (state.map) state.map.setView([25.0, 55.2], 5);
    mapShell.classList.add('hidden');
    searchScreen.classList.remove('hidden');
    if (input) { input.value = ''; input.focus(); }
    if (trackAnother) trackAnother.classList.add('hidden');
    showError('');
  }

  function performSearch() {
    const q = input && input.value;
    if (!q || !String(q).trim()) return showError('Please enter a tracking number.');
    const matched = findShipmentByQuery(q);
    if (!matched) return showError('Tracking number not found.');

    searchScreen.classList.add('hidden');
    mapShell.classList.remove('hidden');
    showError('');
    clearMapData();
    try { window.history.replaceState(null, '', `map.html?id=${matched.trackingNumber}`); } catch (e) {}
    initLiveMapPage(matched);
  }

  btn.addEventListener('click', performSearch);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') performSearch(); });

  if (trackAnother) {
    trackAnother.addEventListener('click', (e) => { e.preventDefault(); resetToSearch(); });
  }

  const preId = getQueryParam('id');
  if (preId && input) {
    input.value = preId;
    performSearch();
    return;
  }

  searchScreen.classList.remove('hidden');
  mapShell.classList.add('hidden');
  if (input) input.focus();
}

function initDetailsSearch() {
  const searchScreen = document.getElementById('search-screen');
  const detailsSections = [
    document.querySelector('.details-summary-card'),
    document.querySelector('.map-shell'),
  ];
  if (!searchScreen) return;

  const input = document.getElementById('details-search-input');
  const btn = document.getElementById('details-search-btn');
  const error = document.getElementById('details-search-error');
  const trackAnother = document.getElementById('details-track-another');

  function showError(msg) { if (error) error.textContent = msg; }
  function hideDetails() { detailsSections.forEach((el) => { if (el) el.classList.add('hidden'); }); }
  function showDetails() { detailsSections.forEach((el) => { if (el) el.classList.remove('hidden'); }); }

  function resetToSearch() {
    showError('');
    hideDetails();
    searchScreen.classList.remove('hidden');
    if (input) { input.value = ''; input.focus(); }
    if (trackAnother) trackAnother.classList.add('hidden');
  }

  function performSearch() {
    const q = input && input.value;
    if (!q || !String(q).trim()) return showError('Please enter a tracking number.');
    const matched = findShipmentByQuery(q);
    if (!matched) return showError('Tracking number not found.');

    searchScreen.classList.add('hidden');
    showDetails();
    showError('');
    if (trackAnother) trackAnother.classList.remove('hidden');
    try { window.history.replaceState(null, '', `details.html?id=${matched.trackingNumber}`); } catch (e) {}
    initTrackingPage(matched);
  }

  btn.addEventListener('click', performSearch);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') performSearch(); });
  if (trackAnother) trackAnother.addEventListener('click', (e) => { e.preventDefault(); resetToSearch(); });

  const preId = getQueryParam('id');
  if (preId && input) {
    input.value = preId;
    performSearch();
    return;
  }

  hideDetails();
  searchScreen.classList.remove('hidden');
  if (input) input.focus();
}

function hidePreloader() {
  const preloader = document.getElementById('preloader');
  const content = document.getElementById('app-content');
  if (!preloader || !content) return;
  preloader.style.opacity = '0';
  content.style.opacity = '1';
  setTimeout(() => {
    preloader.style.display = 'none';
  }, 500);
}

async function initializePage() {
  try {
    const serverShipments = await loadShipmentsFromServer();
    if (serverShipments) {
      hydrateRuntimeShipments(serverShipments);
    } else if (!state.shipments.length) {
      hydrateRuntimeShipments();
    }

    if (document.querySelector('#dashboard-table')) {
      renderDashboard();
    }
    if (document.querySelector('#timeline-list')) {
      initDetailsSearch();
    }
    if (document.querySelector('#live-map')) {
      initMapSearch();
    }
    if (document.querySelector('#control-select')) {
      initControlPage();
    }
    if (window.feather) {
      window.feather.replace();
    }
  } catch (error) {
    console.error('Page initialization failed:', error);
  } finally {
    hidePreloader();
  }
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', initializePage);
} else {
  initializePage();
}
