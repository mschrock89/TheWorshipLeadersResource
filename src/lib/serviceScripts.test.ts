import assert from "node:assert/strict";
import test from "node:test";
import {
  formatScriptWeekendLabel,
  groupScriptAssignments,
  monthStartForDate,
  resolveEffectiveScript,
  scriptKindForPosition,
  weekendKeyForDate,
  weekendStartsInMonth,
} from "./serviceScripts.ts";

test("speaker role names map to announcement and closing prayer scripts", () => {
  assert.equal(scriptKindForPosition("Announcements"), "announcement");
  assert.equal(scriptKindForPosition("announcement", "announcement"), "announcement");
  assert.equal(scriptKindForPosition("Closing Prayer", "closing_prayer"), "closing_prayer");
  assert.equal(scriptKindForPosition("closer"), "closing_prayer");
  assert.equal(scriptKindForPosition("vocalist", "vocalist_1"), null);
});

test("September 2026 weekends are the Saturdays in that month", () => {
  assert.deepEqual(weekendStartsInMonth("2026-09-01"), [
    "2026-09-05",
    "2026-09-12",
    "2026-09-19",
    "2026-09-26",
  ]);
});

test("a Sunday uses the previous Saturday as its weekend key and that Saturday's month", () => {
  assert.equal(weekendKeyForDate("2026-09-06"), "2026-09-05");
  assert.equal(monthStartForDate("2026-09-05"), "2026-09-01");
  assert.equal(formatScriptWeekendLabel("2026-09-26"), "Sep 26–27");
});

test("a sent weekly tweak replaces the monthly script for that weekend only", () => {
  const scripts = [
    {
      script_kind: "announcement",
      month_start: "2026-09-01",
      weekend_date: null,
      body: "Monthly announcements",
      status: "sent",
      ministry_type: "speaker",
      campus_id: "campus-1",
    },
    {
      script_kind: "announcement",
      month_start: "2026-09-01",
      weekend_date: "2026-09-12",
      body: "This week only",
      status: "sent",
      ministry_type: "speaker",
      campus_id: "campus-1",
    },
    {
      script_kind: "announcement",
      month_start: "2026-09-01",
      weekend_date: "2026-09-19",
      body: "Draft tweak",
      status: "draft",
      ministry_type: "speaker",
      campus_id: "campus-1",
    },
  ];

  assert.equal(
    resolveEffectiveScript(scripts, "announcement", "2026-09-13", "speaker", "campus-1").script?.body,
    "This week only",
  );
  assert.equal(
    resolveEffectiveScript(scripts, "announcement", "2026-09-06", "speaker", "campus-1").script?.body,
    "Monthly announcements",
  );
  assert.equal(
    resolveEffectiveScript(scripts, "announcement", "2026-09-20", "speaker", "campus-1").source,
    "month",
  );
  assert.equal(
    resolveEffectiveScript(scripts, "closing_prayer", "2026-09-06", "speaker", "campus-1").script,
    null,
  );
});

test("scheduled announcement and closing prayer dates collapse to one card per weekend", () => {
  const groups = groupScriptAssignments([
    {
      scheduleDate: "2026-09-05",
      campusId: "campus-1",
      campusName: "North",
      ministryType: "speaker",
      position: "announcement",
      teamName: "Team 1",
    },
    {
      scheduleDate: "2026-09-06",
      campusId: "campus-1",
      campusName: "North",
      ministryType: "speaker",
      position: "announcement",
      teamName: "Team 1",
    },
    {
      scheduleDate: "2026-09-12",
      campusId: "campus-1",
      campusName: "North",
      ministryType: "speaker",
      position: "closing_prayer",
      teamName: "Team 2",
    },
    {
      scheduleDate: "2026-09-05",
      campusId: "campus-1",
      campusName: "North",
      ministryType: "speaker",
      position: "vocals",
      teamName: "Team 1",
    },
  ]);

  assert.equal(groups.length, 2);
  assert.equal(groups[0]?.kind, "announcement");
  assert.equal(groups[0]?.weekendKey, "2026-09-05");
  assert.equal(groups[1]?.kind, "closing_prayer");
});
