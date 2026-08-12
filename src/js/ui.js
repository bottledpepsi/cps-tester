import { formatCps, formatDuration, formatInputCode, relativeTime } from "./utils.js";

export class UserInterface {
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
