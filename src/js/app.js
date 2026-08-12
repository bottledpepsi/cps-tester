const TEST_LIMITS = Object.freeze({
  minimumDurationSeconds: 1,
  maximumDurationSeconds: 60,
  defaultDurationSeconds: 5,
});

const STORAGE_KEYS = Object.freeze({
  history: "cps-tester.history.v2",
  legacyUnsaved: "cpsTests",
  legacySaved: "savedTests",
});

const MOUSE_INPUTS = Object.freeze({
  0: { code: "MouseLeft", label: "Left Button" },
  1: { code: "MouseMiddle", label: "Middle Button" },
  2: { code: "MouseRight", label: "Right Button" },
});

const TOUCH_INPUT = Object.freeze({ code: "Touch", label: "Touch" });


/* src/js/utils.js */
function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function createId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function formatInputCode(code) {
  if (!code) return "Not selected";
  if (code === "MouseLeft") return "Left Button";
  if (code === "MouseMiddle") return "Middle Button";
  if (code === "MouseRight") return "Right Button";
  if (code === "Touch") return "Touch";
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Numpad")) return `Numpad ${code.slice(6)}`;
  const labels = {
    Space: "Space",
    Enter: "Enter",
    Escape: "Escape",
    Tab: "Tab",
    Backspace: "Backspace",
    ShiftLeft: "Left Shift",
    ShiftRight: "Right Shift",
    ControlLeft: "Left Ctrl",
    ControlRight: "Right Ctrl",
    AltLeft: "Left Alt",
    AltRight: "Right Alt",
  };
  return labels[code] ?? code;
}

function formatDuration(seconds) {
  return `${Number(seconds).toFixed(2)}s`;
}

function formatCps(clicks, durationSeconds) {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return "0.00";
  return (clicks / durationSeconds).toFixed(2);
}

function relativeTime(isoDate) {
  const timestamp = Date.parse(isoDate);
  if (!Number.isFinite(timestamp)) return "Unknown";

  const differenceSeconds = Math.round((timestamp - Date.now()) / 1000);
  const absoluteSeconds = Math.abs(differenceSeconds);
  const units = [
    [60, "second", 1],
    [3600, "minute", 60],
    [86400, "hour", 3600],
    [Infinity, "day", 86400],
  ];

  for (const [limit, unit, divisor] of units) {
    if (absoluteSeconds < limit) {
      const value = Math.round(differenceSeconds / divisor);
      return new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(value, unit);
    }
  }
  return "Unknown";
}

function normalizeDurationInput(rawValue, minimum, maximum) {
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) return null;
  return clamp(Math.round(parsed), minimum, maximum);
}


/* src/js/storage.js */
function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function sanitizeEntry(entry, saved = false) {
  const clicks = Number(entry?.clicks);
  const duration = Number(entry?.duration ?? entry?.time);
  const completedAt = typeof entry?.completedAt === "string"
    ? entry.completedAt
    : typeof entry?.date === "string"
      ? entry.date
      : new Date().toISOString();

  if (!Number.isFinite(clicks) || clicks < 0 || !Number.isFinite(duration) || duration <= 0) {
    return null;
  }

  return {
    id: typeof entry?.id === "string" ? entry.id : createId(),
    inputCode: typeof entry?.inputCode === "string" ? entry.inputCode : (typeof entry?.key === "string" ? entry.key : "Unknown"),
    inputLabel: typeof entry?.inputLabel === "string" ? entry.inputLabel : (typeof entry?.key === "string" ? entry.key : "Unknown"),
    duration,
    clicks: Math.round(clicks),
    completedAt,
    saved: Boolean(entry?.saved ?? saved),
  };
}

function migrateLegacyHistory() {
  const current = readJson(STORAGE_KEYS.history, null);
  if (Array.isArray(current)) return current.map(entry => sanitizeEntry(entry)).filter(Boolean);

  const legacyUnsaved = readJson(STORAGE_KEYS.legacyUnsaved, []);
  const legacySaved = readJson(STORAGE_KEYS.legacySaved, []);
  const migrated = [
    ...(Array.isArray(legacyUnsaved) ? legacyUnsaved.map(entry => sanitizeEntry(entry, false)) : []),
    ...(Array.isArray(legacySaved) ? legacySaved.map(entry => sanitizeEntry(entry, true)) : []),
  ].filter(Boolean);

  if (migrated.length > 0) writeJson(STORAGE_KEYS.history, migrated);
  return migrated;
}

function loadHistory() {
  return migrateLegacyHistory();
}

function saveHistoryEntry(entry) {
  const history = loadHistory();
  history.push(sanitizeEntry(entry) ?? entry);
  return writeJson(STORAGE_KEYS.history, history);
}

function updateHistoryEntry(id, updates) {
  const history = loadHistory();
  const index = history.findIndex(entry => entry.id === id);
  if (index === -1) return false;
  history[index] = { ...history[index], ...updates };
  return writeJson(STORAGE_KEYS.history, history);
}

function deleteHistoryEntry(id) {
  const history = loadHistory().filter(entry => entry.id !== id);
  return writeJson(STORAGE_KEYS.history, history);
}

function clearHistory() {
  return writeJson(STORAGE_KEYS.history, []);
}


/* src/js/test-engine.js */
class CpsTestEngine {
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


/* src/js/input-controller.js */
class InputController {
  constructor({ onInput }) {
    this.onInput = onInput;
    this.selectedCode = null;
    this.isCapturing = false;
    this.activePointers = new Set();
    this.activeKeys = new Set();
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleKeyUp = this.handleKeyUp.bind(this);
    this.handlePointerDown = this.handlePointerDown.bind(this);
    this.handlePointerUp = this.handlePointerUp.bind(this);
    this.handlePointerCancel = this.handlePointerCancel.bind(this);
    this.handleContextMenu = this.handleContextMenu.bind(this);

    document.addEventListener("keydown", this.handleKeyDown, { capture: true });
    document.addEventListener("keyup", this.handleKeyUp, { capture: true });
    document.addEventListener("pointerdown", this.handlePointerDown, { capture: true });
    document.addEventListener("pointerup", this.handlePointerUp, { capture: true });
    document.addEventListener("pointercancel", this.handlePointerCancel, { capture: true });
    document.addEventListener("contextmenu", this.handleContextMenu, { capture: true });
  }

  setSelectedCode(code) {
    this.selectedCode = code;
    this.clearPressedState();
  }

  beginCapture() {
    this.isCapturing = true;
    this.clearPressedState();
  }

  endCapture() {
    this.isCapturing = false;
    this.clearPressedState();
  }

  destroy() {
    document.removeEventListener("keydown", this.handleKeyDown, { capture: true });
    document.removeEventListener("keyup", this.handleKeyUp, { capture: true });
    document.removeEventListener("pointerdown", this.handlePointerDown, { capture: true });
    document.removeEventListener("pointerup", this.handlePointerUp, { capture: true });
    document.removeEventListener("pointercancel", this.handlePointerCancel, { capture: true });
    document.removeEventListener("contextmenu", this.handleContextMenu, { capture: true });
  }

  clearPressedState() {
    this.activePointers.clear();
    this.activeKeys.clear();
  }

  handleKeyDown(event) {
    if (this.isCapturing) {
      event.preventDefault();
      event.stopPropagation();
      this.selectedCode = event.code;
      this.isCapturing = false;
      this.onInput({ type: "selection", code: event.code });
      return;
    }

    if (event.code !== this.selectedCode || event.repeat) return;
    if (this.activeKeys.has(event.code)) return;
    this.activeKeys.add(event.code);
    this.onInput({ type: "test", code: event.code, timestamp: performance.now() });
  }

  handleKeyUp(event) {
    this.activeKeys.delete(event.code);
  }

  handlePointerDown(event) {
    if (this.isCapturing) {
      const mouseInput = event.pointerType === "mouse" ? MOUSE_INPUTS[event.button] : null;
      if (mouseInput) {
        event.preventDefault();
        event.stopPropagation();
        this.selectedCode = mouseInput.code;
        this.isCapturing = false;
        this.onInput({ type: "selection", code: mouseInput.code });
      } else if (event.pointerType === "touch" || event.pointerType === "pen") {
        event.preventDefault();
        event.stopPropagation();
        this.selectedCode = TOUCH_INPUT.code;
        this.isCapturing = false;
        this.onInput({ type: "selection", code: TOUCH_INPUT.code });
      }
      return;
    }

    const code = this.getPointerCode(event);
    if (!code || code !== this.selectedCode) return;
    if (this.activePointers.has(event.pointerId)) return;

    this.activePointers.add(event.pointerId);
    this.onInput({ type: "test", code, timestamp: performance.now() });

    if (code === "MouseRight") event.preventDefault();
  }

  handlePointerUp(event) {
    this.activePointers.delete(event.pointerId);
  }

  handlePointerCancel(event) {
    this.activePointers.delete(event.pointerId);
  }

  handleContextMenu(event) {
    if (this.selectedCode === "MouseRight") event.preventDefault();
  }

  getPointerCode(event) {
    if (event.pointerType === "touch" || event.pointerType === "pen") return TOUCH_INPUT.code;
    return MOUSE_INPUTS[event.button]?.code ?? null;
  }
}


/* src/js/ui.js */
class UserInterface {
  constructor() {
    this.durationInput = document.querySelector("#durationInput");
    this.inputSelector = document.querySelector("#inputSelector");
    this.inputSelectorLabel = document.querySelector(".input-selector-label");
    this.inputSelectorAction = document.querySelector(".input-selector-action");
    this.startButton = document.querySelector("#startButton");
    this.resetButton = document.querySelector("#resetButton");
    this.testStage = document.querySelector("#testStage");
    this.stageTitle = document.querySelector("#stageTitle");
    this.stageInstruction = document.querySelector("#stageInstruction");
    this.statusMessage = document.querySelector("#statusMessage");
    this.testState = document.querySelector("#testState");
    this.timerValue = document.querySelector("#timerValue");
    this.cpsValue = document.querySelector("#cpsValue");
    this.clickCountValue = document.querySelector("#clickCountValue");
    this.historySort = document.querySelector("#historySort");
    this.historyList = document.querySelector("#historyList");
    this.emptyHistory = document.querySelector("#emptyHistory");
    this.historyCount = document.querySelector("#historyCount");
    this.clearHistoryButton = document.querySelector("#clearHistoryButton");
  }

  setInput(code) {
    this.inputSelectorLabel.textContent = formatInputCode(code);
    this.inputSelectorAction.textContent = "Change input";
    this.inputSelector.dataset.selected = code ?? "";
    this.stageTitle.textContent = "Ready when you are";
    this.stageInstruction.textContent = `Press ${formatInputCode(code)} to begin the timer.`;
  }

  setConfigurationDisabled(disabled) {
    this.durationInput.disabled = disabled;
    this.inputSelector.disabled = disabled;
  }

  setTestState(state) {
    const labels = { idle: "Ready", armed: "Armed", running: "Testing", complete: "Complete" };
    this.testState.textContent = labels[state] ?? "Ready";
    this.testState.dataset.state = state;
  }

  renderLiveStats({ remainingSeconds, elapsedSeconds, clicks, cps, state }) {
    const displayTime = state === "armed" ? Number(this.durationInput.value) : remainingSeconds;
    this.timerValue.textContent = formatDuration(displayTime);
    this.cpsValue.textContent = cps.toFixed(2);
    this.clickCountValue.textContent = String(clicks);
    this.cpsValue.classList.toggle("is-active", state === "running");
    this.testStage.classList.toggle("is-active", state === "running");
    if (state === "running") {
      this.stageTitle.textContent = "Keep clicking!";
      this.stageInstruction.textContent = `${formatDuration(remainingSeconds)} remaining`;
    }
    if (state === "armed") {
      this.stageTitle.textContent = "Press your input";
      this.stageInstruction.textContent = "The timer starts on your first input.";
    }
    if (elapsedSeconds === 0 && state === "idle") {
      this.timerValue.textContent = formatDuration(Number(this.durationInput.value));
    }
  }

  showStatus(message, tone = "neutral") {
    this.statusMessage.textContent = message;
    this.statusMessage.dataset.tone = tone;
  }

  setRunning(running) {
    this.startButton.disabled = running;
    this.startButton.textContent = running ? "Test in progress" : "Start Test";
    this.resetButton.disabled = !running;
    this.setConfigurationDisabled(running);
  }

  resetTestDisplay(durationSeconds) {
    this.setRunning(false);
    this.setTestState("idle");
    this.timerValue.textContent = formatDuration(durationSeconds);
    this.cpsValue.textContent = "0.00";
    this.clickCountValue.textContent = "0";
    this.testStage.classList.remove("is-active", "is-complete");
    this.stageTitle.textContent = this.inputSelector.dataset.selected ? "Ready when you are" : "Select an input to begin";
    this.stageInstruction.textContent = this.inputSelector.dataset.selected
      ? `Press ${this.inputSelectorLabel.textContent} to begin the timer.`
      : "Choose an input above, then start the test.";
  }

  showCompletedResult(result) {
    this.setTestState("complete");
    this.setRunning(false);
    this.testStage.classList.remove("is-active");
    this.testStage.classList.add("is-complete");
    this.timerValue.textContent = formatDuration(result.duration);
    this.cpsValue.textContent = result.cps.toFixed(2);
    this.clickCountValue.textContent = String(result.clicks);
    this.stageTitle.textContent = `${result.cps.toFixed(2)} CPS`;
    this.stageInstruction.textContent = `${result.clicks} clicks in ${result.duration} seconds.`;
    this.showStatus("Test finished! Your result has been added to history.", "success");
  }

  renderHistory(entries) {
    const sortMode = this.historySort.value;
    const sorted = [...entries].sort((first, second) => {
      switch (sortMode) {
        case "completed-asc": return Date.parse(first.completedAt) - Date.parse(second.completedAt);
        case "completed-desc": return Date.parse(second.completedAt) - Date.parse(first.completedAt);
        case "cps-asc": return first.clicks / first.duration - second.clicks / second.duration;
        case "cps-desc": return second.clicks / second.duration - first.clicks / first.duration;
        case "clicks-asc": return first.clicks - second.clicks;
        case "clicks-desc": return second.clicks - first.clicks;
        default: return 0;
      }
    });

    this.historyList.replaceChildren();
    this.emptyHistory.hidden = sorted.length > 0;
    this.historyCount.textContent = `${sorted.length} ${sorted.length === 1 ? "test" : "tests"}`;

    const fragment = document.createDocumentFragment();
    for (const entry of sorted) {
      const row = document.createElement("div");
      row.className = "history-row history-entry";
      row.dataset.saved = String(Boolean(entry.saved));
      row.setAttribute("role", "row");
      row.append(
        this.createCell(entry.inputLabel, "Input"),
        this.createCell(formatDuration(entry.duration), "Time"),
        this.createCell(String(entry.clicks), "Clicks"),
        this.createCell(formatCps(entry.clicks, entry.duration), "CPS"),
        this.createCell(relativeTime(entry.completedAt), "Completed"),
      );
      const actions = document.createElement("div");
      actions.className = "history-actions";
      actions.setAttribute("role", "cell");

      if (!entry.saved) {
        const saveButton = document.createElement("button");
        saveButton.className = "small-button save-button";
        saveButton.type = "button";
        saveButton.dataset.action = "save";
        saveButton.dataset.id = entry.id;
        saveButton.textContent = "Save";
        saveButton.setAttribute("aria-label", `Save ${formatCps(entry.clicks, entry.duration)} CPS result`);
        actions.appendChild(saveButton);
      } else {
        const savedLabel = document.createElement("span");
        savedLabel.className = "saved-label";
        savedLabel.textContent = "Saved";
        actions.appendChild(savedLabel);
      }

      const deleteButton = document.createElement("button");
      deleteButton.className = "small-button delete-button";
      deleteButton.type = "button";
      deleteButton.dataset.action = "delete";
      deleteButton.dataset.id = entry.id;
      deleteButton.textContent = "Delete";
      deleteButton.setAttribute("aria-label", `Delete ${formatCps(entry.clicks, entry.duration)} CPS result`);
      actions.appendChild(deleteButton);
      row.appendChild(actions);
      fragment.appendChild(row);
    }
    this.historyList.appendChild(fragment);
  }

  createCell(text, label) {
    const cell = document.createElement("span");
    cell.setAttribute("role", "cell");
    cell.dataset.label = label;
    cell.textContent = text;
    return cell;
  }
}


/* src/js/app.js */
class CpsTesterApp {
  constructor() {
    this.ui = new UserInterface();
    this.selectedInput = null;
    this.engine = new CpsTestEngine({
      onUpdate: update => this.ui.renderLiveStats(update),
      onComplete: result => this.handleTestComplete(result),
    });
    this.inputController = new InputController({ onInput: event => this.handleInput(event) });
    this.bindEvents();
    this.renderHistory();
    this.ui.resetTestDisplay(TEST_LIMITS.defaultDurationSeconds);
  }

  bindEvents() {
    this.ui.inputSelector.addEventListener("click", () => this.startInputCapture());
    this.ui.startButton.addEventListener("click", () => this.startTest());
    this.ui.resetButton.addEventListener("click", () => this.resetTest());
    this.ui.clearHistoryButton.addEventListener("click", () => this.clearAllHistory());
    this.ui.historySort.addEventListener("change", () => this.renderHistory());
    this.ui.historyList.addEventListener("click", event => this.handleHistoryAction(event));
    this.ui.durationInput.addEventListener("change", () => this.validateDuration());
    this.ui.testStage.addEventListener("click", () => {
      if (this.selectedInput && this.engine.state === "idle") this.startTest();
    });
  }

  startInputCapture() {
    if (this.engine.state === "armed" || this.engine.state === "running") return;
    this.inputController.beginCapture();
    this.ui.inputSelector.classList.add("is-capturing");
    this.ui.inputSelectorAction.textContent = "Press a key…";
    this.ui.showStatus("Press a keyboard key or mouse button to assign it.", "info");
  }

  handleInput(event) {
    if (event.type === "selection") {
      this.selectedInput = event.code;
      this.ui.setInput(event.code);
      this.ui.inputSelector.classList.remove("is-capturing");
      this.ui.showStatus(`Input set to ${formatInputCode(event.code)}. Start the test when ready.`, "neutral");
      return;
    }

    if (event.type !== "test") return;
    if (event.code !== this.selectedInput) return;

    const accepted = this.engine.registerInput(event.timestamp);
    if (accepted && this.engine.state === "running") {
      this.ui.setTestState("running");
      this.ui.showStatus("Testing… keep going!", "info");
    }
  }

  startTest() {
    if (this.engine.state === "armed" || this.engine.state === "running") return;
    if (!this.selectedInput) {
      this.ui.showStatus("Select a key, mouse button, or touch input first.", "warning");
      this.startInputCapture();
      return;
    }

    const duration = this.validateDuration();
    if (duration === null) return;

    this.engine.start(duration, this.selectedInput);
    this.inputController.clearPressedState();
    this.ui.setRunning(true);
    this.ui.setTestState("armed");
    this.ui.showStatus(`Press ${formatInputCode(this.selectedInput)} to start the timer.`, "info");
    this.ui.renderLiveStats({ state: "armed", remainingSeconds: duration, elapsedSeconds: 0, clicks: 0, cps: 0 });
  }

  validateDuration() {
    const duration = normalizeDurationInput(
      this.ui.durationInput.value,
      TEST_LIMITS.minimumDurationSeconds,
      TEST_LIMITS.maximumDurationSeconds,
    );

    if (duration === null) {
      this.ui.durationInput.setCustomValidity("Enter a valid test duration.");
      this.ui.showStatus("Enter a valid duration between 1 and 60 seconds.", "warning");
      return null;
    }

    this.ui.durationInput.setCustomValidity("");
    this.ui.durationInput.value = String(clamp(duration, TEST_LIMITS.minimumDurationSeconds, TEST_LIMITS.maximumDurationSeconds));
    return duration;
  }

  handleTestComplete(result) {
    const inputLabel = result.inputCode === TOUCH_INPUT.code ? TOUCH_INPUT.label : formatInputCode(result.inputCode);
    saveHistoryEntry({ ...result, inputLabel, completedAt: new Date().toISOString(), saved: false });
    this.ui.showCompletedResult(result);
    this.renderHistory();
    this.inputController.clearPressedState();
  }

  resetTest() {
    this.engine.cancel();
    this.inputController.clearPressedState();
    const duration = this.validateDuration() ?? TEST_LIMITS.defaultDurationSeconds;
    this.ui.resetTestDisplay(duration);
    this.ui.showStatus(this.selectedInput ? `Ready to test ${formatInputCode(this.selectedInput)}.` : "Choose an input and start the test.", "neutral");
  }

  renderHistory() {
    this.ui.renderHistory(loadHistory());
  }

  handleHistoryAction(event) {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const id = button.dataset.id;
    if (button.dataset.action === "save") {
      updateHistoryEntry(id, { saved: true });
      this.renderHistory();
      return;
    }
    if (button.dataset.action === "delete") {
      deleteHistoryEntry(id);
      this.renderHistory();
    }
  }

  clearAllHistory() {
    const history = loadHistory();
    if (history.length === 0) return;
    if (!window.confirm("Delete all test history? This cannot be undone.")) return;
    clearHistory();
    this.renderHistory();
  }
}

new CpsTesterApp();
