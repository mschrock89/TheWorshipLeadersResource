import { isStudentResourceAppKey } from "@/lib/resourceApp";
import { isSessionSetMinistryType, normalizeSessionSetMinistryType } from "@/lib/constants";

// Worship ministry types each student resource app is scoped to. Student Camp is
// shared by both HS/MS apps and session variants normalize to this base type.
const STUDENT_APP_MINISTRY_TYPES: Record<string, readonly string[]> = {
  students_hs: ["encounter", "student_camp"],
  students_ms: ["eon", "eon_weekend", "student_camp"],
};

// Returns the worship ministry types relevant to a resource app, or null when the
// app is not ministry-scoped (the default worship app shows every ministry).
export function getResourceAppMinistryTypes(
  resourceAppKey: string | null | undefined,
): readonly string[] | null {
  if (!resourceAppKey) return null;
  return STUDENT_APP_MINISTRY_TYPES[resourceAppKey] ?? null;
}

export function ministryTypeMatchesResourceApp(
  ministryType: string | null | undefined,
  resourceAppKey: string | null | undefined,
) {
  const allowed = getResourceAppMinistryTypes(resourceAppKey);
  if (!allowed) return true;
  if (!ministryType) return false;

  const normalizedMinistryType = normalizeSessionSetMinistryType(ministryType) || ministryType;
  return allowed.includes(ministryType) || allowed.includes(normalizedMinistryType);
}

// Drops setlists/records whose ministry_type does not belong to the current
// resource app. No-op for the default worship app (no ministry scoping).
export function filterByResourceAppMinistry<
  T extends { ministry_type?: string | null },
>(items: T[], resourceAppKey: string | null | undefined) {
  const allowed = getResourceAppMinistryTypes(resourceAppKey);
  if (!allowed) return items;
  return items.filter((item) => ministryTypeMatchesResourceApp(item.ministry_type, resourceAppKey));
}

export function isWednesdayFlowDate(planDate: string | null | undefined) {
  if (!planDate) return false;
  const date = new Date(`${planDate}T00:00:00`);
  return !Number.isNaN(date.getTime()) && date.getDay() === 3;
}

// Multi-day camps (Student Camp, etc.) run sets on several weekdays, so the
// Wednesday-only student flow rule must not hide their non-Wednesday days.
export function isStudentFlowExemptMinistryType(ministryType: string | null | undefined) {
  return isSessionSetMinistryType(ministryType);
}

export function filterStudentWednesdayFlows<
  T extends { plan_date: string; ministry_type?: string | null },
>(
  sets: T[],
  resourceAppKey: string | null | undefined,
) {
  return isStudentResourceAppKey(resourceAppKey)
    ? sets.filter(
        (set) =>
          isStudentFlowExemptMinistryType(set.ministry_type) ||
          isWednesdayFlowDate(set.plan_date),
      )
    : sets;
}
