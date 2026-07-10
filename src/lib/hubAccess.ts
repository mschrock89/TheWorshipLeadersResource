// Client-side mirror of the SQL helpers user_is_org_admin / user_leads_ministry
// (supabase/migrations/20260706130000_add_ministries_and_memberships.sql).
// RLS is the enforcement layer; these only decide what the hub UI offers.

const ORG_ADMIN_ROLES = ["admin", "campus_admin"] as const;

const MINISTRY_LEAD_ROLES: Record<string, readonly string[]> = {
  worship: ["network_worship_pastor", "campus_worship_pastor"],
  students_hs: ["network_student_pastor", "student_pastor", "hs_leader"],
  students_ms: ["network_student_pastor", "student_pastor", "ms_leader", "ms_leader_weekend"],
};

export function isOrgAdminRole(roleNames: string[]) {
  return roleNames.some((role) => (ORG_ADMIN_ROLES as readonly string[]).includes(role));
}

export function leadsMinistry(roleNames: string[], ministryKey: string) {
  if (isOrgAdminRole(roleNames)) return true;
  const leadRoles = MINISTRY_LEAD_ROLES[ministryKey] ?? [];
  return roleNames.some((role) => leadRoles.includes(role));
}

export function getLeadableMinistryKeys(roleNames: string[], ministryKeys: string[]) {
  return ministryKeys.filter((key) => leadsMinistry(roleNames, key));
}

// Anyone who leads at least one ministry (or is an org admin) may open the hub.
export function canAccessHub(roleNames: string[]) {
  return (
    isOrgAdminRole(roleNames) ||
    Object.keys(MINISTRY_LEAD_ROLES).some((key) => leadsMinistry(roleNames, key))
  );
}
