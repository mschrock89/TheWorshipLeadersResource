import assert from "node:assert/strict";
import test from "node:test";
import { shouldCopyCentralWeekendSchedule } from "./campusWeekendScheduleSeed.ts";
import { getEffectiveActiveRotationPeriodId } from "./rotationPeriods.ts";
import { formatWeekendGroupDateLabel, formatWeekendGroupDateLabelCompact } from "./utils.ts";

const murfreesboro = { has_saturday_service: true, has_sunday_service: true };
const cannon = { has_saturday_service: true, has_sunday_service: true };
const shelbyville = { has_saturday_service: false, has_sunday_service: true };

test("Cannon County weekend labels match Murfreesboro Central", () => {
  const saturday = "2026-10-24";
  const sunday = "2026-10-25";
  assert.equal(
    formatWeekendGroupDateLabel(saturday, sunday, cannon),
    formatWeekendGroupDateLabel(saturday, sunday, murfreesboro),
  );
  assert.equal(
    formatWeekendGroupDateLabelCompact(saturday, sunday, cannon),
    formatWeekendGroupDateLabelCompact(saturday, sunday, murfreesboro),
  );
  assert.equal(formatWeekendGroupDateLabel(saturday, sunday, murfreesboro), "Oct 24 - 25, 2026");
});

test("Shelbyville shows Sunday only because it has no Saturday service", () => {
  assert.equal(
    formatWeekendGroupDateLabel("2026-10-24", "2026-10-25", shelbyville),
    "Sunday, October 25, 2026",
  );
  assert.equal(
    formatWeekendGroupDateLabelCompact("2026-10-24", "2026-10-25", shelbyville),
    "Oct 25, 2026",
  );
});

test("each campus resolves the trimester that covers today the same way", () => {
  const referenceDate = new Date("2026-10-24T15:00:00");
  for (const campus of ["central", "cannon", "shelbyville"]) {
    const periods = [1, 2, 3].map((trimester) => ({
      id: `${campus}-t${trimester}`,
      name: `T${trimester} 2026`,
      year: 2026,
      trimester,
      is_active: trimester === 1,
      start_date: trimester === 1 ? "2026-01-01" : trimester === 2 ? "2026-05-01" : "2026-09-01",
      end_date: trimester === 1 ? "2026-04-30" : trimester === 2 ? "2026-08-31" : "2026-12-31",
    }));

    assert.equal(
      getEffectiveActiveRotationPeriodId(periods, new Map(), referenceDate),
      `${campus}-t3`,
    );
  }
});

test("Cannon keeps both weekend days and Shelbyville keeps Sundays from the Central rotation", () => {
  const existing = new Set(["2026-04-26"]);
  assert.equal(
    shouldCopyCentralWeekendSchedule("cannon", { ministry_type: "weekend", schedule_date: "2026-04-26" }, existing),
    false,
  );
  assert.equal(
    shouldCopyCentralWeekendSchedule("cannon", { ministry_type: "weekend", schedule_date: "2026-10-24" }, existing),
    true,
  );
  assert.equal(
    shouldCopyCentralWeekendSchedule("cannon", { ministry_type: "weekend", schedule_date: "2026-10-25" }, existing),
    true,
  );
  assert.equal(
    shouldCopyCentralWeekendSchedule("shelbyville", { ministry_type: "weekend", schedule_date: "2026-10-24" }, new Set()),
    false,
  );
  assert.equal(
    shouldCopyCentralWeekendSchedule("shelbyville", { ministry_type: "weekend", schedule_date: "2026-10-25" }, new Set()),
    true,
  );
  assert.equal(
    shouldCopyCentralWeekendSchedule("shelbyville", { ministry_type: "video", schedule_date: "2026-10-25" }, new Set()),
    false,
  );
});
