import { formatCps } from "./utils.js";

export class CpsTestEngine {
  constructor({ onUpdate, onComplete }) {
    this.onUpdate = onUpdate;
    this.onComplete = onComplete;
    this.reset();
  }

  reset() {
    this.state = "idle";
    this.durationSeconds = 0;
    this.startTime = 0;
    this.deadline = 0;
    this.clickCount = 0;
    this.animationFrameId = null;
    this.finishTimeoutId = null;
  }

  start(durationSeconds, inputCode) {
    this.cancel();
    this.state = "armed";
    this.durationSeconds = durationSeconds;
    this.inputCode = inputCode;
    this.clickCount = 0;
    this.startTime = 0;
    this.deadline = 0;
    this.emitUpdate(0);
  }

  registerInput(timestamp = performance.now()) {
    if (this.state !== "armed" && this.state !== "running") return false;

    if (this.state === "armed") {
      this.state = "running";
      this.startTime = timestamp;
      this.deadline = timestamp + this.durationSeconds * 1000;
      this.scheduleCompletion();
    }

    if (timestamp > this.deadline) {
      this.finish(timestamp);
      return false;
    }

    this.clickCount += 1;
    this.emitUpdate(Math.min(timestamp - this.startTime, this.durationSeconds * 1000));
    return true;
  }

  finish(timestamp = performance.now()) {
    if (this.state === "idle" || this.state === "complete") return;

    const elapsedMilliseconds = this.startTime > 0
      ? Math.min(Math.max(timestamp - this.startTime, 0), this.durationSeconds * 1000)
      : 0;
    const measuredDuration = this.durationSeconds;
    const result = {
      inputCode: this.inputCode,
      duration: measuredDuration,
      clicks: this.clickCount,
      cps: Number(formatCps(this.clickCount, measuredDuration)),
      elapsedMilliseconds,
    };

    this.clearTimers();
    this.state = "complete";
    this.emitUpdate(measuredDuration * 1000);
    this.onComplete(result);
  }

  cancel() {
    this.clearTimers();
    this.reset();
  }

  emitUpdate(elapsedMilliseconds) {
    const elapsedSeconds = this.startTime > 0 ? elapsedMilliseconds / 1000 : 0;
    const remainingSeconds = Math.max(this.durationSeconds - elapsedSeconds, 0);
    const cps = elapsedSeconds > 0 ? this.clickCount / elapsedSeconds : 0;
    this.onUpdate({
      state: this.state,
      remainingSeconds,
      elapsedSeconds,
      clicks: this.clickCount,
      cps,
    });
  }

  scheduleCompletion() {
    this.finishTimeoutId = window.setTimeout(() => this.finish(this.deadline), this.durationSeconds * 1000 + 20);
    const render = () => {
      if (this.state !== "running") return;
      const now = performance.now();
      if (now >= this.deadline) {
        this.finish(now);
        return;
      }
      this.emitUpdate(now - this.startTime);
      this.animationFrameId = requestAnimationFrame(render);
    };
    this.animationFrameId = requestAnimationFrame(render);
  }

  clearTimers() {
    if (this.animationFrameId !== null) cancelAnimationFrame(this.animationFrameId);
    if (this.finishTimeoutId !== null) clearTimeout(this.finishTimeoutId);
    this.animationFrameId = null;
    this.finishTimeoutId = null;
  }
}
