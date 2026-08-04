/*
  In a real Swiftlane Logistics application, these render helpers would be triggered by
  websocket updates or a real-time push service instead of local timers.
  This demo keeps the same page structure while using shared utility logic
  across dashboard, tracking, and live map screens.
*/

export function formatNow(isoString) {
  const date = new Date(isoString);
  const options = { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' };
  return new Intl.DateTimeFormat('en-US', options).format(date);
}

export function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

export function statusLabel(status) {
  return {
    pending: 'Pending',
    in_transit: 'In transit',
    out_for_delivery: 'Out for delivery',
    delivered: 'Delivered',
    delayed: 'Delayed',
  }[status] ?? 'Unknown';
}

export function statusClass(status) {
  return {
    pending: 'status-pill pending',
    in_transit: 'status-pill in-transit',
    out_for_delivery: 'status-pill out-for-delivery',
    delivered: 'status-pill delivered',
    delayed: 'status-pill delayed',
  }[status] ?? 'status-pill';
}

export function renderEventItem(event, active = false) {
  return `
    <li class="timeline-event ${active ? 'active' : ''}">
      <div class="timeline-badge"></div>
      <div>
        <strong>${event.title}</strong>
        <p>${event.meta}</p>
      </div>
    </li>
  `;
}

const statusOrder = {
  pending: 1,
  in_transit: 2,
  out_for_delivery: 3,
  delivered: 4,
  delayed: 5,
};

export function sortShipments(shipments, field, direction = 'asc') {
  return [...shipments].sort((a, b) => {
    let left = a[field];
    let right = b[field];

    if (field === 'lastUpdate') {
      left = new Date(left);
      right = new Date(right);
    }

    if (field === 'status') {
      left = statusOrder[left] ?? 0;
      right = statusOrder[right] ?? 0;
    }

    if (left === right) return 0;
    const compare = left > right ? 1 : -1;
    return direction === 'asc' ? compare : -compare;
  });
}
