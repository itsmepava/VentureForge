import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateWeekendBaseline,
  percentageChangeFromBaseline,
  qualifiesForStealthAlert,
  shouldCreateStealthAlert,
} from "./github-events-rules.ts";

test("calculates a 90-day weekend baseline from historical samples", () => {
  assert.equal(calculateWeekendBaseline([]), 0);
  assert.equal(calculateWeekendBaseline([2, 4, 6]), 4);
});

test("fires the stealth alert at exactly a 300% increase", () => {
  assert.equal(qualifiesForStealthAlert(20, 5), true);
  assert.equal(percentageChangeFromBaseline(20, 5), 300);
  assert.equal(qualifiesForStealthAlert(19, 5), false);
  assert.equal(qualifiesForStealthAlert(4, 0), false);
});

test("suppresses a duplicate alert for the same weekend window", () => {
  assert.equal(shouldCreateStealthAlert(20, 5, false), true);
  assert.equal(shouldCreateStealthAlert(20, 5, true), false);
});