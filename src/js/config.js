export const TEST_LIMITS = Object.freeze({
  minimumDurationSeconds: 1,
  maximumDurationSeconds: 60,
  defaultDurationSeconds: 5,
});

export const STORAGE_KEYS = Object.freeze({
  history: "cps-tester.history.v2",
  legacyUnsaved: "cpsTests",
  legacySaved: "savedTests",
});

export const MOUSE_INPUTS = Object.freeze({
  0: { code: "MouseLeft", label: "Left Button" },
  1: { code: "MouseMiddle", label: "Middle Button" },
  2: { code: "MouseRight", label: "Right Button" },
});

export const TOUCH_INPUT = Object.freeze({ code: "Touch", label: "Touch" });
