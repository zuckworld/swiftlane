import { shipments } from './data.js';
import { formatNow, getQueryParam, statusLabel, statusClass, renderEventItem, sortShipments } from './app.js';

const state = {
  activeShipment: null,
  eventProgress: 0,
  eventTimer: null,
  sortField: 'status',
  sortDirection: 'asc',
  map: null,
  mapMarkers: [],
  routeLayers: [],
  selectedRider: null,
};

const statusOrder = { pending: 1, in_transit: 2, out_for_delivery: 3, delivered: 4, delayed: 5 };

function formatUpdatedLabel(ship) {
  return formatNow(ship.lastUpdate);
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
  const total = shipments.length;
  const inTransit = shipments.filter((item) => item.status === 'in_transit').length;
  const delivered = shipments.filter((item) => item.status === 'delivered').length;
  const delayed = shipments.filter((item) => item.status === 'delayed').length;
  return {
    total,
    inTransit,
    delivered,
    delayed,
  };
}

function renderDashboard() {
  const cardData = buildStatCards();
  document.getElementById('stats-today').textContent = cardData.total;
  document.getElementById('stats-in-transit').textContent = cardData.inTransit;
  document.getElementById('stats-delivered').textContent = cardData.delivered;
  document.getElementById('stats-delayed').textContent = cardData.delayed;

  const heroImage = document.getElementById('hero-visual-container');
  if (heroImage) heroImage.innerHTML = renderHeroImage();

  renderShipmentTable();
  attachTableSorting();
}

function renderShipmentTable() {
  const body = document.getElementById('table-body');
  if (!body) return;
  const sorted = sortShipments(shipments, state.sortField, state.sortDirection);
  const headers = ['Tracking', 'Sender', 'Receiver', 'Status', 'Rider', 'Last update'];
  body.innerHTML = sorted
    .map((shipment) => {
      const cols = [
        shipment.trackingNumber,
        shipment.sender,
        shipment.receiver,
        `<span class="${statusClass(shipment.status)}">${statusLabel(shipment.status)}</span>`,
        shipment.riderName,
        formatNow(shipment.lastUpdate),
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

function initTrackingPage(matchedShipment = null) {
  let shipment = matchedShipment || null;
  const trackingId = getQueryParam('id');

  if (!shipment) {
    shipment = trackingId ? shipments.find((item) => item.trackingNumber === trackingId) : null;
  }

  if (!shipment) {
    if (trackingId) return renderMissingShipment();
    shipment = shipments.find((item) => item.status !== 'delivered') || shipments[0];
    if (shipment) window.history.replaceState(null, '', `details.html?id=${shipment.trackingNumber}`);
  }

  if (!shipment) return renderMissingShipment();

  state.activeShipment = shipment;
  document.title = `Swiftlane - ${shipment.trackingNumber}`;
  const elOrder = document.getElementById('details-order');
  const elStatus = document.getElementById('details-status');
  const elFrom = document.getElementById('details-from');
  const elTo = document.getElementById('details-to');
  const elRider = document.getElementById('details-rider');
  const elUpdated = document.getElementById('details-updated');
  if (elOrder) elOrder.textContent = shipment.trackingNumber;
  if (elStatus) elStatus.innerHTML = `<span class="${statusClass(shipment.status)}">${statusLabel(shipment.status)}</span>`;
  if (elFrom) elFrom.textContent = shipment.sender;
  if (elTo) elTo.textContent = shipment.receiver;
  if (elRider) elRider.textContent = shipment.riderName;
  if (elUpdated) elUpdated.textContent = formatNow(shipment.lastUpdate);
  renderRouteList();
  renderTimeline(0);
  startTimelinePlayback();
}

function renderRouteList() {
  const list = document.getElementById('routes-list');
  if (!list) return;
  list.innerHTML = state.activeShipment.route
    .map((stop) => `<li>${stop.name}</li>`)
    .join('');
}

function renderTimeline(activeIndex) {
  const list = document.getElementById('timeline-list');
  if (!list) return;
  list.innerHTML = state.activeShipment.events
    .map((event, index) => renderEventItem(event, index <= activeIndex))
    .join('');
}

function startTimelinePlayback() {
  if (!state.activeShipment) return;
  state.eventProgress = 0;
  document.getElementById('timeline-progress').style.width = '0%';
  if (state.eventTimer) clearTimeout(state.eventTimer);
  const nextEvent = state.activeShipment.events[state.eventProgress];
  if (!nextEvent) return;
  state.eventTimer = setTimeout(stepTimeline, nextEvent.delaySec * 200);
}

function stepTimeline() {
  if (!state.activeShipment) return;
  renderTimeline(state.eventProgress);
  const progress = Math.round(((state.eventProgress + 1) / state.activeShipment.events.length) * 100);
  const bar = document.getElementById('timeline-progress');
  if (bar) bar.style.width = `${progress}%`;
  state.eventProgress += 1;
  if (state.eventProgress < state.activeShipment.events.length) {
    const next = state.activeShipment.events[state.eventProgress];
    state.eventTimer = setTimeout(stepTimeline, next.delaySec * 200);
  }
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
    // reuse existing map instance
    state.map.setView([25.0, 55.2], 5);
    clearMapData();
  }

  renderLiveRiders(matchedShipment);
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
  const sidebar = document.getElementById('rider-list');

  const activeShipments = matchedShipment ? [matchedShipment] : shipments.filter((item) => item.status !== 'pending');

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

  activeShipments.forEach((shipment, index) => {
    const lastStop = shipment.route[shipment.route.length - 1];
    const marker = L.marker([lastStop.lat, lastStop.lng], {
      icon: createRiderIcon(shipment.status, shipment.riderName.split(' ')[0]),
    }).addTo(state.map);
    state.mapMarkers.push(marker);
    const routeLine = L.polyline(shipment.route.map((stop) => [stop.lat, stop.lng]), {
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
      const [lat, lng] = [shipment.route[shipment.route.length - 1].lat, shipment.route[shipment.route.length - 1].lng];
      state.map.flyTo([lat, lng], 8, { duration: 1.1 });
      document.querySelectorAll('.rider-item').forEach((item) => item.classList.remove('selected'));
      button.classList.add('selected');
    });
  });
}

function initControlPage() {
  const select = document.getElementById('control-select');
  const statusSelect = document.getElementById('control-status');
  const notes = document.getElementById('control-notes');
  const details = document.getElementById('control-details');
  if (!select || !statusSelect || !notes || !details) return;

  select.innerHTML = shipments
    .map((shipment) => `<option value="${shipment.trackingNumber}">${shipment.trackingNumber} � ${shipment.riderName}</option>`)
    .join('');

  statusSelect.innerHTML = [
    { value: 'pending', label: 'Pending' },
    { value: 'in_transit', label: 'In transit' },
    { value: 'out_for_delivery', label: 'Out for delivery' },
    { value: 'delivered', label: 'Delivered' },
    { value: 'delayed', label: 'Delayed' },
  ]
    .map((item) => `<option value="${item.value}">${item.label}</option>`)
    .join('');

  const renderControlDetail = () => {
    const shipment = shipments.find((item) => item.trackingNumber === select.value);
    if (!shipment) return;
    details.innerHTML = `
      <p><strong>Rider:</strong> ${shipment.riderName}</p>
      <p><strong>Status:</strong> <span class="${statusClass(shipment.status)}">${statusLabel(shipment.status)}</span></p>
      <p><strong>Route:</strong> ${shipment.sender.split(',')[0]} ? ${shipment.receiver.split(',')[0]}</p>
      <p><strong>Updated:</strong> ${formatNow(shipment.lastUpdate)}</p>
    `;
    statusSelect.value = shipment.status;
  };

  select.addEventListener('change', renderControlDetail);
  renderControlDetail();

  document.getElementById('control-update-btn').addEventListener('click', () => {
    const shipment = shipments.find((item) => item.trackingNumber === select.value);
    if (!shipment) return;
    shipment.status = statusSelect.value;
    shipment.lastUpdate = new Date().toISOString();
    notes.textContent = `Status updated to ${statusLabel(shipment.status)}.`;
    renderControlDetail();
  });

  document.getElementById('control-reset-btn').addEventListener('click', () => {
    const shipment = shipments.find((item) => item.trackingNumber === select.value);
    if (!shipment) return;
    shipment.status = 'pending';
    shipment.lastUpdate = new Date().toISOString();
    notes.textContent = 'Shipment reset to pending.';
    renderControlDetail();
  });
}

function initMapSearch() {
  const searchScreen = document.getElementById('search-screen');
  const mapShell = document.querySelector('.map-shell');
  if (!searchScreen || !mapShell) return;

  const input = document.getElementById('search-input');
  const btn = document.getElementById('search-btn');
  const error = document.getElementById('search-error');
  const trackAnother = document.getElementById('track-another');

  const normalize = (s) => String(s || '').trim().toUpperCase();

  function showError(msg) {
    if (error) error.textContent = msg;
  }

  function resetToSearch() {
    // clear map layers and reset UI
    clearMapData();
    if (state.map) state.map.setView([25.0, 55.2], 5);
    mapShell.classList.add('hidden');
    searchScreen.classList.remove('hidden');
    if (input) { input.value = ''; input.focus(); }
    if (trackAnother) trackAnother.classList.add('hidden');
    showError('');
  }

  function findMatch(q) {
    const qnorm = normalize(q);
    if (!qnorm) return null;
    // exact match
    let m = shipments.find((s) => normalize(s.trackingNumber) === qnorm);
    if (m) return m;
    // endsWith last 4-6 digits
    m = shipments.find((s) => normalize(s.trackingNumber).endsWith(qnorm));
    if (m) return m;
    // contains
    m = shipments.find((s) => normalize(s.trackingNumber).includes(qnorm));
    if (m) return m;
    // match by digits only
    const digits = q.replace(/\D/g, '');
    if (digits) {
      m = shipments.find((s) => s.trackingNumber.replace(/\D/g, '').endsWith(digits));
      if (m) return m;
    }
    return null;
  }

  function performSearch() {
    const q = input && input.value;
    if (!q || !String(q).trim()) return showError('Please enter a tracking number.');
    const matched = findMatch(q);
    if (!matched) return showError('Tracking number not found.');

    // hide search, show map, and initialize map with matched shipment
    searchScreen.classList.add('hidden');
    mapShell.classList.remove('hidden');
    showError('');
    clearMapData();
    // update URL
    try { window.history.replaceState(null, '', `map.html?id=${matched.trackingNumber}`); } catch (e) {}
    initLiveMapPage(matched);
  }

  btn.addEventListener('click', performSearch);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') performSearch(); });

  if (trackAnother) {
    trackAnother.addEventListener('click', (e) => { e.preventDefault(); resetToSearch(); });
  }

  // if URL has id, prefill and run search
  const preId = getQueryParam('id');
  if (preId && input) {
    input.value = preId;
    performSearch();
    return;
  }

  // start on search screen
  searchScreen.classList.remove('hidden');
  mapShell.classList.add('hidden');
  if (input) input.focus();
}

function initDetailsSearch() {
  const searchScreen = document.getElementById('search-screen');
  const detailsSections = [document.querySelector('.details-summary-card'), document.querySelector('.stages-panel'), document.querySelector('.info-grid')];
  if (!searchScreen) return;

  const input = document.getElementById('details-search-input');
  const btn = document.getElementById('details-search-btn');
  const error = document.getElementById('details-search-error');
  const trackAnother = document.getElementById('details-track-another');

  const normalize = (s) => String(s || '').trim().toUpperCase();

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

  function findMatch(q) {
    const qnorm = normalize(q);
    if (!qnorm) return null;
    let m = shipments.find((s) => normalize(s.trackingNumber) === qnorm);
    if (m) return m;
    m = shipments.find((s) => normalize(s.trackingNumber).endsWith(qnorm));
    if (m) return m;
    m = shipments.find((s) => normalize(s.trackingNumber).includes(qnorm));
    if (m) return m;
    const digits = q.replace(/\D/g, '');
    if (digits) {
      m = shipments.find((s) => s.trackingNumber.replace(/\D/g, '').endsWith(digits));
      if (m) return m;
    }
    return null;
  }

  function performSearch() {
    const q = input && input.value;
    if (!q || !String(q).trim()) return showError('Please enter a tracking number.');
    const matched = findMatch(q);
    if (!matched) return showError('Tracking number not found.');

    // show details and run tracking flow
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

  // start on search screen
  // if URL has id, prefill and run search
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

function initializePage() {
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
}

window.addEventListener('DOMContentLoaded', initializePage);
