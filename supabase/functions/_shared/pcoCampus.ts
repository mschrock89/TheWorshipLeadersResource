export interface CampusNameRef {
  id: string;
  name: string;
}

/**
 * Map a Planning Center service type onto a campus.
 * Shelbyville and Cannon County use the same rules as Murfreesboro Central:
 * the campus name in the service type wins, then known abbreviations
 * (CC, Boro), then the connected campus.
 */
export function campusIdFromServiceTypeName(
  serviceTypeName: string,
  campuses: CampusNameRef[] | null | undefined,
  connectionCampusId: string | null,
): string | null {
  if (!campuses || campuses.length === 0) return connectionCampusId;

  const lowerName = serviceTypeName.toLowerCase();

  for (const campus of campuses) {
    const campusLower = campus.name.toLowerCase();
    if (lowerName.includes(campusLower)) {
      return campus.id;
    }
    if (campusLower === "tullahoma" && (lowerName.includes("tullahoma") || lowerName === "tullahoma worship")) {
      return campus.id;
    }
    if (campusLower === "shelbyville" && lowerName.includes("shelbyville")) {
      return campus.id;
    }
    if (campusLower === "cannon county" && (lowerName.includes("cannon") || lowerName.includes("cannon county"))) {
      return campus.id;
    }
    if (campusLower === "murfreesboro north" && (lowerName.includes("murfreesboro north") || lowerName.includes("boro north"))) {
      return campus.id;
    }
    if (campusLower === "murfreesboro central" && (lowerName.includes("murfreesboro central") || lowerName === "murfreesboro central")) {
      return campus.id;
    }
  }

  if (lowerName.includes("worship night") || lowerName.includes("all team") || lowerName.includes("prayer night")) {
    return null;
  }

  if (
    lowerName.includes("ms worship") ||
    lowerName.includes("eon") ||
    lowerName.includes("hs worship") ||
    lowerName.includes("encounter") ||
    lowerName.includes("er") ||
    lowerName.includes("evident")
  ) {
    if (lowerName.includes("(cc)") || lowerName.includes(" cc)") || /(?:^|\s)cc$/.test(lowerName)) {
      const cannonCounty = campuses.find((campus) => campus.name.toLowerCase().includes("cannon"));
      if (cannonCounty) return cannonCounty.id;
    }

    if (
      lowerName.includes("(boro)") ||
      lowerName.includes(" boro)") ||
      lowerName.includes("eon boro") ||
      lowerName.includes("ms worship boro")
    ) {
      const central = campuses.find((campus) => campus.name.toLowerCase().includes("central"));
      if (central) return central.id;
    }

    for (const campus of campuses) {
      if (lowerName.includes(campus.name.toLowerCase())) {
        return campus.id;
      }
    }

    const central = campuses.find((campus) => campus.name.toLowerCase().includes("central"));
    return central?.id || connectionCampusId;
  }

  return connectionCampusId;
}
