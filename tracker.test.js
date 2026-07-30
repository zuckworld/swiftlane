import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createInitialTrackerState,
  getTrackerSummary,
  pauseTracker,
  resetTracker,
  resumeTracker,
  setPauseTarget,
  tickTracker,
} from './tracker.js';

const stages = ['Pickup', 'Transit', 'Delivered'];

test('advances to the next stage and pauses when the selected stage is reached', () => {
  let state = createInitialTrackerState(stages, { stageDurationMs: 1000 });
  state = setPauseTarget(state, 1);
  state = tickTracker(state, 1001);

  assert.equal(state.currentStageIndex, 1);
  assert.equal(state.isPaused, true);
  assert.equal(state.pausedAtStageIndex, 1);
});

test('reset restores the initial state', () => {
  let state = createInitialTrackerState(stages, { stageDurationMs: 1000 });
  state = tickTracker(state, 500);
  state = pauseTracker(state);
  state = resetTracker(state);

  const summary = getTrackerSummary(state);

  assert.equal(summary.currentStageIndex, 0);
  assert.equal(summary.isPaused, false);
  assert.equal(summary.elapsedSeconds, 0);
});

test('resume clears the pause flag', () => {
  let state = createInitialTrackerState(stages, { stageDurationMs: 1000 });
  state = pauseTracker(state);
  state = resumeTracker(state);

  assert.equal(state.isPaused, false);
  assert.equal(state.pausedAtStageIndex, null);
});
