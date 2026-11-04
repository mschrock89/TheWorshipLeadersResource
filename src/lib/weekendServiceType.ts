export function normalizeServiceTypeName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Weekend worship plans, not Wednesday night, kids camp, or student services. */
export function isWeekendServiceTypeName(
  serviceTypeName: string,
  campusNames: Iterable<string>,
): boolean {
  const normalized = normalizeServiceTypeName(serviceTypeName);
  if (normalized === "weekend" || normalized === "weekend worship") return true;

  for (const campusName of campusNames) {
    const campus = normalizeServiceTypeName(campusName);
    if (!campus) continue;
    if (normalized === campus || normalized === `${campus} worship`) return true;
  }

  return false;
}
