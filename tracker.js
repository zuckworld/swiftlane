export const DEFAULT_STAGE_DURATION_MS = 5000;

export function createInitialTrackerState(stages, options = {}) {
  const stageDurations = stages.map((stage) => stage.durationMs ?? options.stageDurationMs ?? DEFAULT_STAGE_DURATION_MS);
  const initialDuration = stageDurations[0] ?? DEFAULT_STAGE_DURATION_MS;

  return {
    stages,
    stageDurations,
    currentStageIndex: 0,
    isPaused: false,
    completed: false,
    elapsedMs: 0,
    stageTimeLeftMs: initialDuration,
    stageDurationMs: initialDuration,
    pauseAtStageIndex: null,
    pausedAtStageIndex: null,
  };
}

export function tickTracker(state, tickMs = 250) {
  if (state.isPaused || state.completed) {
    return state;
  }

  const nextElapsed = state.elapsedMs + tickMs;
  const nextStageTimeLeft = state.stageTimeLeftMs - tickMs;

  if (nextStageTimeLeft > 0) {
    return {
      ...state,
      elapsedMs: nextElapsed,
      stageTimeLeftMs: nextStageTimeLeft,
    };
  }

  const nextIndex = state.currentStageIndex + 1;

  if (nextIndex >= state.stages.length) {
    return {
      ...state,
      elapsedMs: nextElapsed,
      currentStageIndex: state.stages.length - 1,
      completed: true,
      isPaused: true,
      stageTimeLeftMs: 0,
      pausedAtStageIndex: state.stages.length - 1,
    };
  }

  const nextDuration = state.stageDurations[nextIndex] ?? state.stageDurationMs;
  const reachedPausePoint = nextIndex === state.pauseAtStageIndex;

  return {
    ...state,
    elapsedMs: nextElapsed,
    currentStageIndex: nextIndex,
    stageDurationMs: nextDuration,
    stageTimeLeftMs: nextDuration,
    isPaused: reachedPausePoint,
    pausedAtStageIndex: reachedPausePoint ? nextIndex : null,
  };
}

export function pauseTracker(state) {
  return {
    ...state,
    isPaused: true,
    pausedAtStageIndex: state.currentStageIndex,
  };
}

export function resumeTracker(state) {
  return {
    ...state,
    isPaused: false,
    pausedAtStageIndex: null,
  };
}

export function resetTracker(state) {
  return createInitialTrackerState(state.stages, {
    stageDurationMs: state.stageDurations?.[0] ?? state.stageDurationMs,
  });
}

export function setPauseTarget(state, stageIndex) {
  return {
    ...state,
    pauseAtStageIndex: stageIndex,
  };
}

export function getTrackerSummary(state) {
  const currentStage = state.stages[state.currentStageIndex] ?? null;
  const progressPercent = Math.round((state.currentStageIndex / Math.max(1, state.stages.length - 1)) * 100);

  return {
    currentStage,
    currentStageIndex: state.currentStageIndex,
    stageCount: state.stages.length,
    progressPercent: state.completed ? 100 : progressPercent,
    elapsedSeconds: Math.floor(state.elapsedMs / 1000),
    stageTimeLeftSeconds: Math.max(0, Math.ceil(state.stageTimeLeftMs / 1000)),
    isPaused: state.isPaused,
    completed: state.completed,
    pauseAtStageIndex: state.pauseAtStageIndex,
    pausedAtStageIndex: state.pausedAtStageIndex,
  };
}
