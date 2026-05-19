export const TEAM_BUILDER_BLANK_SLOT_MEMBER_NAME = "__TEAM_BUILDER_BLANK_SLOT__";

export function isBlankTeamBuilderMemberName(memberName?: string | null) {
  return memberName === TEAM_BUILDER_BLANK_SLOT_MEMBER_NAME;
}

export function isBlankTeamBuilderAssignment(assignment?: {
  user_id?: string | null;
  member_name?: string | null;
} | null) {
  return (
    !!assignment &&
    !assignment.user_id &&
    isBlankTeamBuilderMemberName(assignment.member_name)
  );
}
