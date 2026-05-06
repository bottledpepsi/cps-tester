/**
 * CPS Tester — script.js
 *
 * Measures Clicks Per Second (CPS) for any keyboard key or mouse button.
 * Persists test history in localStorage using two buckets: "cpsTests"
 * (unsaved) and "savedTests" (user-saved). Entries from both are merged
 * and displayed together, sorted by user preference.
 */

"use strict";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY_UNSAVED = "cpsTests";
const STORAGE_KEY_SAVED   = "savedTests";

/** Maps MouseEvent.button index → internal key code */
const MOUSE_MAP = ["MouseLeft", "MouseMiddle", "MouseRight"];

/** Human-readable labels for mouse buttons */
const MOUSE_DISPLAY = {
    MouseLeft:   "Left Button",
    MouseMiddle: "Middle Button",
    MouseRight:  "Right Button",
};

/** How often (ms) the live-stats interval fires */
const TICK_MS = 50;

/** Maximum test duration a user can enter (seconds) */
const MAX_DURATION_S = 60;

/** Minimum test duration (seconds) */
const MIN_DURATION_S = 1;

// ---------------------------------------------------------------------------
// DOM references
// ---------------------------------------------------------------------------

const keyInputEl      = document.getElementById("keyInput");
const startButtonEl   = document.getElementById("startButton");
const secondsInputEl  = document.getElementById("seconds");
const timerDisplayEl  = document.getElementById("timer");
const cpsDisplayEl    = document.getElementById("cps");
const clicksDisplayEl = document.getElementById("clicks");
const statusDisplayEl = document.getElementById("status");
const historyListEl   = document.getElementById("historyList");
const sorterEl        = document.getElementById("sorter");
const clearHistoryBtn = document.getElementById("clearHistoryBtn");
const emptyStateEl    = document.getElementById("emptyState");

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let testKey         = null;   // Internal key code string, e.g. "KeyA" / "MouseLeft"
let clicks          = 0;
let running         = false;  // True from Start until test ends
let started         = false;  // True once first click is registered (timer begins)
let startTime       = 0;      // performance.now() snapshot when timer started
let duration        = 0;      // Selected test duration in seconds
let tickIntervalId  = null;
const pressedKeys   = new Set();  // Tracks held-down keys to prevent auto-repeat CPS inflation
let waitingForInput = false;

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

/**
 * Returns a human-readable label for an internal key code.
 * @param {string} code  e.g. "KeyA", "Digit3", "MouseLeft", "Space"
 * @returns {string}
 */
function formatKey(code) {
    if (code.startsWith("Key"))    return code.slice(3);
    if (code.startsWith("Digit"))  return code.slice(5);
    if (code.startsWith("Mouse"))  return MOUSE_DISPLAY[code] ?? code;
    return code;
}

/**
 * Returns a relative-time string like "5 minutes ago".
 * Uses the Intl.RelativeTimeFormat API where available, falling back
 * to a simple manual implementation for older browsers.
 * @param {string} isoDate  ISO 8601 date string
 * @returns {string}
 */
function timeSince(isoDate) {
    const diffSec = Math.floor((Date.now() - new Date(isoDate).getTime()) / 1000);

    const thresholds = [
        { limit: 60,    unit: "second" },
        { limit: 3600,  unit: "minute", div: 60 },
        { limit: 86400, unit: "hour",   div: 3600 },
        { limit: Infinity, unit: "day", div: 86400 },
    ];

    for (const t of thresholds) {
        if (diffSec < t.limit) {
            const value = t.div ? Math.floor(diffSec / t.div) : diffSec;
            // Intl.RelativeTimeFormat gives grammatically correct output
            if (typeof Intl !== "undefined" && Intl.RelativeTimeFormat) {
                const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
                return rtf.format(-value, t.unit);
            }
            return `${value} ${t.unit}${value !== 1 ? "s" : ""} ago`;
        }
    }
    return "a long time ago";
}

/**
 * Clamps `value` between `min` and `max`.
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

/**
 * Reads a storage key safely, returning the default value on any error.
 * @param {string} key
 * @param {*} defaultValue
 * @returns {*}
 */
function storageGet(key, defaultValue) {
    try {
        const raw = localStorage.getItem(key);
        return raw === null ? defaultValue : JSON.parse(raw);
    } catch {
        // localStorage unavailable or data is corrupt — degrade gracefully
        return defaultValue;
    }
}

/**
 * Writes a value to localStorage, failing silently (e.g. private browsing
 * quota exceeded).
 * @param {string} key
 * @param {*} value
 */
function storageSet(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch {
        // Storage full or blocked — history simply won't persist this session
        console.warn(`[CPS Tester] Could not save to localStorage key "${key}".`);
    }
}

// ---------------------------------------------------------------------------
// History management
// ---------------------------------------------------------------------------

/**
 * Saves a completed test to the unsaved-tests bucket.
 * Each entry gets a stable, unique ID based on timestamp + random suffix.
 * @param {string} key       Formatted key label
 * @param {number} time      Duration in seconds
 * @param {number} clickCount  Total clicks recorded
 */
function saveHistory(key, time, clickCount) {
    const stored = storageGet(STORAGE_KEY_UNSAVED, []);
    const entry = {
        // FIX: Use a timestamp+random ID instead of stored.length+1 to avoid
        // collisions when entries have been deleted.
        id:     `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        key,
        time,
        clicks: clickCount,
        date:   new Date().toISOString(),
    };
    stored.push(entry);
    storageSet(STORAGE_KEY_UNSAVED, stored);
    loadHistory();
}

/**
 * Moves a test from the unsaved bucket to the saved bucket.
 * @param {{ id: string }} test
 */
function moveToSaved(test) {
    const unsaved = storageGet(STORAGE_KEY_UNSAVED, []).filter(t => t.id !== test.id);
    storageSet(STORAGE_KEY_UNSAVED, unsaved);

    const saved = storageGet(STORAGE_KEY_SAVED, []);
    // FIX: strip the runtime-only `saved` flag before persisting
    const { saved: _flag, ...cleanTest } = test;
    saved.push(cleanTest);
    storageSet(STORAGE_KEY_SAVED, saved);

    loadHistory();
}

/**
 * Permanently deletes a test from whichever bucket it belongs to.
 * @param {{ id: string, saved: boolean }} test
 */
function deleteEntry(test) {
    const key = test.saved ? STORAGE_KEY_SAVED : STORAGE_KEY_UNSAVED;
    const current = storageGet(key, []).filter(t => t.id !== test.id);
    storageSet(key, current);
    loadHistory();
}

/**
 * Clears both storage buckets after confirmation.
 */
function clearAllHistory() {
    if (!window.confirm("Delete all test history? This cannot be undone.")) return;
    storageSet(STORAGE_KEY_UNSAVED, []);
    storageSet(STORAGE_KEY_SAVED, []);
    loadHistory();
}

/**
 * Reads both storage buckets, merges, sorts, and renders the history list.
 */
function loadHistory() {
    // Merge both buckets with a runtime `saved` flag for UI logic
    const unsaved = storageGet(STORAGE_KEY_UNSAVED, []).map(e => ({ ...e, saved: false }));
    const saved   = storageGet(STORAGE_KEY_SAVED,   []).map(e => ({ ...e, saved: true  }));
    const combined = [...unsaved, ...saved];

    // Show/hide empty state message
    emptyStateEl.hidden = combined.length > 0;

    // Sort
    const sortBy = sorterEl.value;
    combined.sort((a, b) => {
        switch (sortBy) {
            case "completed-asc":  return new Date(a.date) - new Date(b.date);
            case "completed-desc": return new Date(b.date) - new Date(a.date);
            case "cps-asc":        return (a.clicks / a.time) - (b.clicks / b.time);
            case "cps-desc":       return (b.clicks / b.time) - (a.clicks / a.time);
            case "clicks-asc":     return a.clicks - b.clicks;
            case "clicks-desc":    return b.clicks - a.clicks;
            default:               return 0;
        }
    });

    // Render — build DOM in a fragment to avoid layout thrashing
    const fragment = document.createDocumentFragment();
    combined.forEach(entry => {
        // FIX: Guard against division by zero (entry.time === 0) and
        // corrupt/missing fields before rendering.
        const entryTime   = Number(entry.time)   || 0;
        const entryClicks = Number(entry.clicks)  || 0;
        const cps = entryTime > 0
            ? (entryClicks / entryTime).toFixed(2)
            : "0.00";

        const row = document.createElement("div");
        row.className = "history-entry";
        row.setAttribute("role", "listitem");

        // FIX: Use textContent for user-originated data (key name) to prevent
        // XSS from a crafted key value stored in localStorage.
        const cells = [
            entry.key || "—",
            `${entryTime}s`,
            String(entryClicks),
            cps,
            timeSince(entry.date),
        ];

        cells.forEach(text => {
            const cell = document.createElement("div");
            cell.textContent = text;   // ← never innerHTML for untrusted data
            row.appendChild(cell);
        });

        // Actions cell
        const actionsCell = document.createElement("div");
        actionsCell.className = "actions-cell";

        if (!entry.saved) {
            const saveBtn = document.createElement("button");
            saveBtn.textContent = "Save";
            saveBtn.className   = "save-btn";
            saveBtn.setAttribute("aria-label", `Save test: ${cps} CPS`);
            saveBtn.addEventListener("click", () => moveToSaved(entry));
            actionsCell.appendChild(saveBtn);
        } else {
            const savedLabel   = document.createElement("span");
            savedLabel.className   = "saved-label";
            savedLabel.textContent = "Saved";
            actionsCell.appendChild(savedLabel);
        }

        const deleteBtn = document.createElement("button");
        deleteBtn.textContent = "✕";
        deleteBtn.className   = "delete-btn";
        deleteBtn.setAttribute("aria-label", `Delete this test entry`);
        deleteBtn.addEventListener("click", () => deleteEntry(entry));
        actionsCell.appendChild(deleteBtn);

        row.appendChild(actionsCell);
        fragment.appendChild(row);
    });

    historyListEl.innerHTML = "";  // single DOM mutation after building fragment
    historyListEl.appendChild(fragment);
}

// ---------------------------------------------------------------------------
// Input selection
// ---------------------------------------------------------------------------

keyInputEl.addEventListener("focus", () => {
    waitingForInput = true;
    keyInputEl.value = "";
    keyInputEl.placeholder = "Press a key or click…";
});

keyInputEl.addEventListener("blur", () => {
    // If user blurs without choosing, restore previous label (or placeholder)
    if (waitingForInput) {
        waitingForInput = false;
        keyInputEl.value = testKey ? formatKey(testKey) : "";
        keyInputEl.placeholder = "Click here to set key";
    }
});

keyInputEl.addEventListener("keydown", e => {
    if (!waitingForInput) return;
    e.preventDefault();
    testKey = e.code;
    keyInputEl.value = formatKey(testKey);
    keyInputEl.placeholder = "Click here to set key";
    waitingForInput = false;
    keyInputEl.blur();
});

keyInputEl.addEventListener("mousedown", e => {
    if (!waitingForInput) return;
    // Only handle defined mouse buttons (ignore buttons 3+ which may not have a mapping)
    const btnCode = MOUSE_MAP[e.button];
    if (!btnCode) return;
    testKey = btnCode;
    keyInputEl.value = formatKey(testKey);
    keyInputEl.placeholder = "Click here to set key";
    waitingForInput = false;
    // Defer blur so the mousedown event fully resolves first
    setTimeout(() => keyInputEl.blur(), 0);
});

// ---------------------------------------------------------------------------
// Test lifecycle
// ---------------------------------------------------------------------------

startButtonEl.addEventListener("click", () => {
    if (running) return;

    if (!testKey) {
        statusDisplayEl.textContent = "⚠ Select a key or mouse button first.";
        keyInputEl.focus();
        return;
    }

    // FIX: Clamp duration input to valid range instead of trusting raw value
    const rawDuration = parseFloat(secondsInputEl.value);
    if (isNaN(rawDuration)) {
        statusDisplayEl.textContent = "⚠ Enter a valid test duration.";
        secondsInputEl.focus();
        return;
    }
    duration = clamp(rawDuration, MIN_DURATION_S, MAX_DURATION_S);
    secondsInputEl.value = duration;  // reflect clamped value back

    startButtonEl.blur();
    keyInputEl.disabled    = true;
    secondsInputEl.disabled = true;
    startButtonEl.disabled  = true;
    startButtonEl.textContent = "Running…";

    clicks  = 0;
    started = false;
    running = true;

    clicksDisplayEl.textContent = "Clicks: 0";
    cpsDisplayEl.textContent    = "CPS: 0.00";
    timerDisplayEl.textContent  = `Time: ${duration.toFixed(1)}s`;
    statusDisplayEl.textContent = `Press '${formatKey(testKey)}' to start!`;
});

/**
 * Begins the countdown timer. Called on the first registered click
 * after the user has pressed Start.
 */
function startTimer() {
    started   = true;
    startTime = performance.now();

    tickIntervalId = setInterval(() => {
        const elapsed   = (performance.now() - startTime) / 1000;
        const remaining = Math.max(0, duration - elapsed);

        timerDisplayEl.textContent  = `Time: ${remaining.toFixed(1)}s`;
        // FIX: Avoid division by near-zero: use elapsed directly (always > 0 here)
        cpsDisplayEl.textContent    = `CPS: ${(clicks / elapsed).toFixed(2)}`;
        clicksDisplayEl.textContent = `Clicks: ${clicks}`;

        if (remaining <= 0) endTest(elapsed);
    }, TICK_MS);
}

/**
 * Stops the timer, saves results, and re-enables the UI.
 * @param {number} [actualElapsed]  Precise elapsed time; falls back to duration.
 */
function endTest(actualElapsed) {
    clearInterval(tickIntervalId);
    tickIntervalId = null;
    running = false;
    started = false;

    // Use the actual elapsed time for accuracy rather than the nominal duration
    const recordedTime = actualElapsed != null
        ? Math.min(parseFloat(actualElapsed.toFixed(2)), duration)
        : duration;

    const finalCPS = recordedTime > 0
        ? (clicks / recordedTime).toFixed(2)
        : "0.00";

    timerDisplayEl.textContent  = `Time: ${recordedTime.toFixed(1)}s`;
    cpsDisplayEl.textContent    = `CPS: ${finalCPS}`;
    clicksDisplayEl.textContent = `Clicks: ${clicks}`;
    statusDisplayEl.textContent = `Test finished!`;

    saveHistory(formatKey(testKey), recordedTime, clicks);

    keyInputEl.disabled     = false;
    secondsInputEl.disabled = false;
    startButtonEl.disabled  = false;
    startButtonEl.textContent = "Start Test";

    pressedKeys.clear();
}

// ---------------------------------------------------------------------------
// Input event handlers
// ---------------------------------------------------------------------------

// Keyboard clicks
document.addEventListener("keydown", e => {
    if (!running) return;
    if (e.code !== testKey) return;
    // FIX: Prevent key-repeat (held key) from inflating click count
    if (pressedKeys.has(e.code)) return;

    pressedKeys.add(e.code);
    if (!started) startTimer();
    clicks++;
});

document.addEventListener("keyup", e => {
    pressedKeys.delete(e.code);
});

// Mouse clicks
document.addEventListener("mousedown", e => {
    if (!running) return;
    const btnCode = MOUSE_MAP[e.button];
    if (!btnCode || btnCode !== testKey) return;
    if (pressedKeys.has(btnCode)) return;

    pressedKeys.add(btnCode);
    if (!started) startTimer();
    clicks++;
});

document.addEventListener("mouseup", e => {
    const btnCode = MOUSE_MAP[e.button];
    if (btnCode) pressedKeys.delete(btnCode);
});

// Prevent the context menu from appearing when Right Button is the test key
document.addEventListener("contextmenu", e => {
    if (running && testKey === "MouseRight") {
        e.preventDefault();
    }
});

// ---------------------------------------------------------------------------
// Sorter and clear
// ---------------------------------------------------------------------------

sorterEl.addEventListener("change", loadHistory);
clearHistoryBtn.addEventListener("click", clearAllHistory);

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

loadHistory();
