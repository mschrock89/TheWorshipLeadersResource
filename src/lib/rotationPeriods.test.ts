import assert from "node:assert/strict";
import test from "node:test";
import {
  applyEffectiveActiveRotationPeriods,
  getEffectiveActiveRotationPeriodId,
} from "./rotationPeriods.ts";

const t1 = {
  id: "t1",
  name: "T1 2026",
  year: 2026,
  trimester: 1,
  is_active: false,
  start_date: "2026-01-01",
  end_date: "2026-04-30",
};

const t2 = {
  id: "t2",
  name: "T2 2026",
  year: 2026,
  trimester: 2,
  is_active: true,
  start_date: "2026-05-01",
  end_date: "2026-08-31",
};

const t3 = {
  id: "t3",
  name: "T3 2026",
  year: 2026,
  trimester: 3,
  is_active: false,
  start_date: "2026-09-01",
  end_date: "2026-12-31",
};

test("marks the date-covering period active even when the DB flag still points at T2", () => {
  const effectiveId = getEffectiveActiveRotationPeriodId(
    [t1, t2, t3],
    new Map([["T3 2026", "2026-10-04"]]),
    new Date("2026-09-19T12:00:00"),
  );

  assert.equal(effectiveId, "t3");
});

test("keeps T2 active before T3 dates and before the 10-day advance window", () => {
  const effectiveId = getEffectiveActiveRotationPeriodId(
    [t1, t2, t3],
    new Map([["T3 2026", "2026-10-04"]]),
    new Date("2026-08-15T12:00:00"),
  );

  assert.equal(effectiveId, "t2");
});

test("advances to T3 10 days before its start date when T2 is still covering", () => {
  const overlappingT2 = { ...t2, end_date: "2026-09-30" };
  const effectiveId = getEffectiveActiveRotationPeriodId(
    [t1, overlappingT2, t3],
    new Map(),
    new Date("2026-08-23T12:00:00"),
  );

  assert.equal(effectiveId, "t3");
});

test("advances to T3 10 days before its first scheduled service", () => {
  const effectiveId = getEffectiveActiveRotationPeriodId(
    [t1, t2, { ...t3, start_date: "2026-10-01", end_date: "2026-12-31" }],
    new Map([["T3 2026", "2026-09-27"]]),
    new Date("2026-09-18T12:00:00"),
  );

  assert.equal(effectiveId, "t3");
});

test("applyEffectiveActiveRotationPeriods puts (Active) on T3 during T3 dates", () => {
  const periods = applyEffectiveActiveRotationPeriods(
    [t1, t2, t3],
    new Map(),
    new Date("2026-09-19T12:00:00"),
  );

  assert.deepEqual(
    periods.map((period) => ({ id: period.id, is_active: period.is_active })),
    [
      { id: "t1", is_active: false },
      { id: "t2", is_active: false },
      { id: "t3", is_active: true },
    ],
  );
});
