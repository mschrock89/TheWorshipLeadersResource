import { isStudentResourceAppKey } from "@/lib/resourceApp";

export function isWednesdayFlowDate(planDate: string | null | undefined) {
  if (!planDate) return false;
  const date = new Date(`${planDate}T00:00:00`);
  return !Number.isNaN(date.getTime()) && date.getDay() === 3;
}

export function filterStudentWednesdayFlows<T extends { plan_date: string }>(
  sets: T[],
  resourceAppKey: string | null | undefined,
) {
  return isStudentResourceAppKey(resourceAppKey)
    ? sets.filter((set) => isWednesdayFlowDate(set.plan_date))
    : sets;
}
