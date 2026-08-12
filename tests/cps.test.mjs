import assert from "node:assert/strict";
import { formatCps, normalizeDurationInput } from "../src/js/utils.js";

assert.equal(formatCps(25, 5), "5.00");
assert.equal(formatCps(0, 5), "0.00");
assert.equal(formatCps(10, 1), "10.00");
assert.equal(formatCps(10, 0), "0.00");
assert.equal(normalizeDurationInput("5", 1, 60), 5);
assert.equal(normalizeDurationInput("5.7", 1, 60), 6);
assert.equal(normalizeDurationInput("0", 1, 60), 1);
assert.equal(normalizeDurationInput("100", 1, 60), 60);
assert.equal(normalizeDurationInput("wat", 1, 60), null);

console.log("CPS calculation and duration validation tests passed.");
