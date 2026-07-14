import { DEFAULT_RESOURCE_APP_KEY, getResourceAppForLocation, type ResourceAppKey } from "@/lib/resourceApps";

export function getCurrentResourceAppKey(): ResourceAppKey {
  return getResourceAppForLocation().key ?? DEFAULT_RESOURCE_APP_KEY;
}

export function isStudentResourceAppKey(resourceAppKey: ResourceAppKey | string | null | undefined) {
  return resourceAppKey === "students_hs" || resourceAppKey === "students_ms";
}

export function isCurrentStudentResourceApp() {
  return isStudentResourceAppKey(getCurrentResourceAppKey());
}

export function hasStudentAppAdminRole(
  roleNames: string[],
  resourceAppKey: ResourceAppKey | string = getCurrentResourceAppKey(),
) {
  return (
    isStudentResourceAppKey(resourceAppKey) &&
    (roleNames.includes("student_pastor") || roleNames.includes("network_student_pastor"))
  );
}

export function hasOrgAdminPrivilegesForResourceApp(
  roleNames: string[],
  resourceAppKey: ResourceAppKey | string = getCurrentResourceAppKey(),
) {
  return roleNames.includes("admin") || hasStudentAppAdminRole(roleNames, resourceAppKey);
}

export interface CovenantTerminology {
  /** Document/card title, e.g. "Team Covenant" or "Leader Expectations". */
  title: string;
  /** Mid-sentence noun, e.g. "Covenant" or "Leader Expectations". */
  noun: string;
  /** Admin section title, e.g. "Covenant Manager" or "Leader Expectations Manager". */
  managerTitle: string;
}

export function getCovenantTerminology(
  resourceAppKey: ResourceAppKey | string = getCurrentResourceAppKey(),
): CovenantTerminology {
  if (isStudentResourceAppKey(resourceAppKey)) {
    return {
      title: "Leader Expectations",
      noun: "Leader Expectations",
      managerTitle: "Leader Expectations Manager",
    };
  }

  return {
    title: "Team Covenant",
    noun: "Covenant",
    managerTitle: "Covenant Manager",
  };
}
