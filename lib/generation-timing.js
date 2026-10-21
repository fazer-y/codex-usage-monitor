'use strict';

class GenerationTiming {
  constructor() {
    this.turn = null;
    this.phaseStartedAt = null;
  }

  bind(turn) {
    if (this.turn === turn) return;
    this.turn = turn;
    this.phaseStartedAt = null;
    turn.generation = { outputTokens: 0, durationMs: 0, requestCount: 0, estimated: true };
  }

  start(turn, timestamp) {
    this.bind(turn);
    const time = timestamp?.getTime();
    if (this.phaseStartedAt === null && Number.isFinite(time)) this.phaseStartedAt = time;
  }

  toolCompleted(turn, timestamp) {
    this.bind(turn);
    const time = timestamp?.getTime();
    if (Number.isFinite(time)) this.phaseStartedAt = Math.max(this.phaseStartedAt ?? time, time);
  }

  recordUsage(turn, timestamp, outputTokens) {
    this.bind(turn);
    const time = timestamp?.getTime();
    if (!Number.isFinite(time)) return;
    const duration = this.phaseStartedAt === null ? 0 : time - this.phaseStartedAt;
    if (duration > 0 && outputTokens > 0) {
      turn.generation.outputTokens += outputTokens;
      turn.generation.durationMs += duration;
      turn.generation.requestCount++;
    }
    this.phaseStartedAt = Math.max(this.phaseStartedAt ?? time, time);
  }
}

module.exports = { GenerationTiming };
