export function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

export function createId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function formatInputCode(code) {
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

export function formatDuration(seconds) {
  return `${Number(seconds).toFixed(2)}s`;
}

export function formatCps(clicks, durationSeconds) {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return "0.00";
  return (clicks / durationSeconds).toFixed(2);
}

export function relativeTime(isoDate) {
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

export function normalizeDurationInput(rawValue, minimum, maximum) {
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) return null;
  return clamp(Math.round(parsed), minimum, maximum);
}
