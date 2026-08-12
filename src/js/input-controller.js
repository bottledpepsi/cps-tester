import { MOUSE_INPUTS, TOUCH_INPUT } from "./config.js";

export class InputController {
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
