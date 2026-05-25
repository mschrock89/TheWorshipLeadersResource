import { DEFAULT_RESOURCE_APP_KEY, getResourceAppForLocation, type ResourceAppKey } from "@/lib/constants";

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
  return isStudentResourceAppKey(resourceAppKey) && roleNames.includes("student_pastor");
}

export function hasOrgAdminPrivilegesForResourceApp(
  roleNames: string[],
  resourceAppKey: ResourceAppKey | string = getCurrentResourceAppKey(),
) {
  return roleNames.includes("admin") || hasStudentAppAdminRole(roleNames, resourceAppKey);
}
