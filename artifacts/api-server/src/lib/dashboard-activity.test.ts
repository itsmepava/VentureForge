import assert from "node:assert/strict";
import test from "node:test";
import { buildActivityItems } from "./dashboard-activity.ts";

test("activity feed preserves persisted alert company and severity metadata", () => {
  const now = new Date("2026-09-04T03:00:00.000Z");
  const items = buildActivityItems(
    [],
    undefined,
    [
      {
        id: "alert-1",
        title: "Pre-Intent Stealth Alert",
        description: "Weekend commit velocity spiked 340% for Target Labs.",
        detectedAt: new Date("2026-09-04T02:00:00.000Z"),
        companyId: "company-1",
        severity: "high",
      },
    ],
    now,
  );

  assert.deepEqual(items[0], {
    id: "activity-alert-alert-1",
    kind: "alert",
    title: "Pre-Intent Stealth Alert",
    description: "Weekend commit velocity spiked 340% for Target Labs.",
    timestamp: "2026-09-04T02:00:00.000Z",
    companyId: "company-1",
    severity: "high",
  });
});