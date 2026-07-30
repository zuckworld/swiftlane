import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSimulationState,
  getSimulationSnapshot,
  rerouteSimulation,
  tickSimulation,
} from './simulation.js';

const baseShipment = {
  trackingNumber: 'SIM-100',
  sender: 'New York',
  receiver: 'Dubai',
  route: [
    { name: 'Start', lat: 40.7128, lng: -74.006 },
    { name: 'Middle', lat: 30.0, lng: 40.0 },
    { name: 'Destination', lat: 25.2048, lng: 55.2708 },
  ],
};

test('preview mode compresses the trip into roughly 90 seconds', () => {
  const state = createSimulationState(baseShipment, { mode: 'preview', etaHours: 4 });
  const after = tickSimulation(state, Date.now() + 90_000);

  assert.ok(after.progressFraction >= 0.99);
});

test('rerouting uses the live position and recomputes a shorter remaining ETA', () => {
  const state = createSimulationState(baseShipment, { mode: 'realtime', etaHours: 12, progressFraction: 0.8 });
  const snapshot = getSimulationSnapshot(baseShipment, state, Date.now());
  const rerouted = rerouteSimulation(state, { name: 'New UAE Hub', lat: 25.2, lng: 55.3 }, snapshot.position, Date.now());

  assert.equal(rerouted.progressFraction, 0);
  assert.ok(rerouted.remainingEtaHours < 4);
  assert.ok(rerouted.remainingEtaHours > 0);
  assert.deepEqual(rerouted.route[0], baseShipment.route[0]);
  assert.deepEqual(rerouted.route[1], snapshot.position);
});

test('status becomes derived from progress and delayed overrides', () => {
  const state = createSimulationState(baseShipment, { progressFraction: 0.9, isDelayed: false });
  const snapshot = getSimulationSnapshot(baseShipment, state, Date.now());

  assert.equal(snapshot.status, 'out_for_delivery');

  const delayedState = createSimulationState(baseShipment, { progressFraction: 0.2, isDelayed: true });
  const delayedSnapshot = getSimulationSnapshot(baseShipment, delayedState, Date.now());

  assert.equal(delayedSnapshot.status, 'delayed');
});
