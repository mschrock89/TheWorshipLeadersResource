import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Loader2, Plus, Users, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";
import {
  CustomService,
  useCreateCustomService,
  useCustomServiceAssignments,
  useCustomServiceCampusMembers,
  useSaveCustomServiceRoster,
  useUpdateCustomService,
} from "@/hooks/useCustomServices";
import { POSITION_LABELS, POSITION_SLOTS, SET_PLANNER_MINISTRY_OPTIONS } from "@/lib/constants";
import { getCurrentResourceAppKey } from "@/lib/resourceApp";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type TeamPosition = Database["public"]["Enums"]["team_position"];

// Mirrors the role list offered in Set Planner's custom service assignments.
const ROLE_OPTIONS: Array<{ value: TeamPosition; label: string }> = [
  { value: "vocalist", label: "Vocalist" },
  { value: "acoustic_1", label: "AG 1" },
  { value: "acoustic_2", label: "AG 2" },
  { value: "electric_1", label: "EG 1" },
  { value: "electric_2", label: "EG 2" },
  { value: "bass", label: "Bass" },
  { value: "drums", label: "Drums" },
  { value: "keys", label: "Keys" },
  { value: "sound_tech", label: "FOH" },
  { value: "mon", label: "MON" },
  { value: "broadcast", label: "Broadcast" },
  { value: "audio_shadow", label: "Audio Shadow" },
  { value: "lighting", label: "Lighting" },
  { value: "media", label: "Lyrics" },
  { value: "producer", label: "Producer" },
  { value: "tri_pod_camera", label: "Tri-Pod Camera" },
  { value: "hand_held_camera", label: "Hand-Held Camera" },
  { value: "director", label: "Director" },
  { value: "graphics", label: "Graphics" },
  { value: "switcher", label: "Switcher" },
  { value: "photo_team", label: "Photography Team" },
  { value: "art_team", label: "Art Team" },
];

const VALID_ROLE_VALUES = new Set<string>(ROLE_OPTIONS.map((role) => role.value));

const PRODUCTION_MINISTRY_TYPES = new Set(["production", "ms_hs_production", "hs_production"]);
const VIDEO_MINISTRY_TYPES = new Set(["video"]);

function roleLabel(role: string) {
  return ROLE_OPTIONS.find((option) => option.value === role)?.label || POSITION_LABELS[role] || role;
}

/**
 * Short hint shown next to members who only serve on support teams
 * (production / video) so they're easy to spot when building a roster.
 */
function supportMinistryHint(ministryTypes: string[]): string | null {
  if (ministryTypes.length === 0) return null;
  const hasProduction = ministryTypes.some((ministry) => PRODUCTION_MINISTRY_TYPES.has(ministry));
  const hasVideo = ministryTypes.some((ministry) => VIDEO_MINISTRY_TYPES.has(ministry));
  const onlySupport = ministryTypes.every(
    (ministry) => PRODUCTION_MINISTRY_TYPES.has(ministry) || VIDEO_MINISTRY_TYPES.has(ministry),
  );
  if (!onlySupport) return null;
  if (hasProduction && hasVideo) return "Production/Video";
  if (hasProduction) return "Production";
  if (hasVideo) return "Video";
  return null;
}

interface BreakStatus {
  onBreak: boolean;
  blackoutOnDate: boolean;
  pending: boolean;
  requestType: "need_break" | "willing_break";
}

/**
 * Break/blackout statuses for every user whose rotation period covers the
 * service date. Not-denied requests count so leaders see pending ones too.
 */
function useBreakStatusesForDate(serviceDate?: string) {
  return useQuery({
    queryKey: ["break-statuses-for-date", serviceDate],
    enabled: !!serviceDate,
    queryFn: async () => {
      const { data: periods, error: periodsError } = await supabase
        .from("rotation_periods")
        .select("id")
        .lte("start_date", serviceDate!)
        .gte("end_date", serviceDate!);
      if (periodsError) throw periodsError;

      const periodIds = (periods || []).map((period) => period.id);
      const statuses = new Map<string, BreakStatus>();
      if (periodIds.length === 0) return statuses;

      const { data: requests, error } = await supabase
        .from("break_requests")
        .select("user_id, request_scope, request_type, status, blackout_dates")
        .in("rotation_period_id", periodIds)
        .neq("status", "denied");
      if (error) throw error;

      for (const request of requests || []) {
        const onBreak = request.request_scope === "full_trimester";
        const blackoutOnDate =
          request.request_scope === "blackout_dates" &&
          (request.blackout_dates || []).includes(serviceDate!);
        if (!onBreak && !blackoutOnDate) continue;

        const existing = statuses.get(request.user_id);
        statuses.set(request.user_id, {
          onBreak: onBreak || existing?.onBreak || false,
          blackoutOnDate: blackoutOnDate || existing?.blackoutOnDate || false,
          pending: request.status === "pending" || existing?.pending || false,
          requestType: request.request_type as BreakStatus["requestType"],
        });
      }

      return statuses;
    },
  });
}

interface CopyableTeamRoster {
  /** Unique select value: `${teamId}:${group}` */
  key: string;
  label: string;
  members: Array<{ userId: string; name: string; role: TeamPosition }>;
}

type RosterGroup = "worship" | "production" | "video";

const ROSTER_GROUP_LABELS: Record<RosterGroup, string> = {
  worship: "Worship",
  production: "Production",
  video: "Video",
};

function rosterGroupForMember(ministryTypes: string[] | null): RosterGroup {
  const ministries = ministryTypes?.length ? ministryTypes : ["weekend"];
  if (ministries.some((ministry) => PRODUCTION_MINISTRY_TYPES.has(ministry))) return "production";
  if (ministries.some((ministry) => VIDEO_MINISTRY_TYPES.has(ministry))) return "video";
  return "worship";
}

/**
 * Existing Team Builder rosters for the rotation period covering the date,
 * usable as a starting lineup. Each team is split into worship / production /
 * video crews so support teams can be copied onto the service independently.
 */
function useCopyableTeamRosters(campusId?: string, serviceDate?: string) {
  const resourceAppKey = getCurrentResourceAppKey();

  return useQuery({
    queryKey: ["copyable-team-rosters", campusId, serviceDate, resourceAppKey],
    enabled: !!campusId && !!serviceDate,
    queryFn: async () => {
      const { data: periods, error: periodsError } = await supabase
        .from("rotation_periods")
        .select("id")
        .or(`campus_id.eq.${campusId},campus_id.is.null`)
        .lte("start_date", serviceDate!)
        .gte("end_date", serviceDate!);
      if (periodsError) throw periodsError;

      const periodIds = (periods || []).map((period) => period.id);
      if (periodIds.length === 0) return [] as CopyableTeamRoster[];

      const { data: teams, error: teamsError } = await supabase
        .from("worship_teams")
        .select("id, name")
        .eq("resource_app_key", resourceAppKey)
        .order("name");
      if (teamsError) throw teamsError;
      if (!teams?.length) return [] as CopyableTeamRoster[];

      const { data: members, error: membersError } = await supabase
        .from("team_members")
        .select("team_id, user_id, member_name, position, position_slot, ministry_types")
        .in("rotation_period_id", periodIds)
        .in("team_id", teams.map((team) => team.id))
        .not("user_id", "is", null);
      if (membersError) throw membersError;

      const rosters: CopyableTeamRoster[] = [];
      for (const team of teams) {
        const grouped: Record<RosterGroup, Array<{ userId: string; name: string; role: TeamPosition }>> = {
          worship: [],
          production: [],
          video: [],
        };

        for (const member of members || []) {
          if (member.team_id !== team.id || !member.user_id) continue;
          let role: TeamPosition = "other";
          if (member.position && VALID_ROLE_VALUES.has(member.position)) {
            role = member.position as TeamPosition;
          } else {
            const slotConfig = POSITION_SLOTS.find((slot) => slot.slot === member.position_slot);
            if (slotConfig && VALID_ROLE_VALUES.has(slotConfig.position)) {
              role = slotConfig.position as TeamPosition;
            }
          }
          grouped[rosterGroupForMember(member.ministry_types)].push({
            userId: member.user_id as string,
            name: member.member_name || "Unnamed Member",
            role,
          });
        }

        const populatedGroups = (Object.keys(ROSTER_GROUP_LABELS) as RosterGroup[]).filter(
          (group) => grouped[group].length > 0,
        );
        for (const group of populatedGroups) {
          // Keep the plain team name when only a worship crew exists; label
          // crews once a team also carries production/video members.
          const needsGroupLabel = populatedGroups.length > 1 || group !== "worship";
          rosters.push({
            key: `${team.id}:${group}`,
            label: needsGroupLabel ? `${team.name} • ${ROSTER_GROUP_LABELS[group]}` : team.name,
            members: grouped[group],
          });
        }
      }
      return rosters;
    },
  });
}

interface RosterEntry {
  userId: string;
  userName: string;
  roles: TeamPosition[];
}

interface CustomServiceBuilderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campuses: Array<{ id: string; name: string }>;
  /** When set, the dialog edits this service (details + roster) instead of creating one. */
  existingService?: CustomService | null;
}

export function CustomServiceBuilderDialog({
  open,
  onOpenChange,
  campuses,
  existingService,
}: CustomServiceBuilderDialogProps) {
  const isEditMode = !!existingService;

  const [campusId, setCampusId] = useState("");
  const [ministry, setMinistry] = useState("weekend");
  const [serviceName, setServiceName] = useState("");
  const [serviceDate, setServiceDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [soundCheckTime, setSoundCheckTime] = useState("");
  const [repeatsWeekly, setRepeatsWeekly] = useState(false);

  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [rosterInitialized, setRosterInitialized] = useState(false);
  const [pendingMemberId, setPendingMemberId] = useState("");
  const [pendingRoles, setPendingRoles] = useState<TeamPosition[]>([]);
  const [rolePopoverOpen, setRolePopoverOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const createCustomService = useCreateCustomService();
  const updateCustomService = useUpdateCustomService();
  const saveRoster = useSaveCustomServiceRoster();

  const { data: campusMembers = [] } = useCustomServiceCampusMembers(campusId || undefined);
  const { data: breakStatuses } = useBreakStatusesForDate(serviceDate || undefined);
  const { data: copyableRosters = [] } = useCopyableTeamRosters(campusId || undefined, serviceDate || undefined);
  const { data: existingAssignments = [] } = useCustomServiceAssignments(
    existingService?.id,
    existingService?.service_date,
  );

  // Reset / hydrate whenever the dialog opens.
  useEffect(() => {
    if (!open) return;
    if (existingService) {
      setCampusId(existingService.campus_id || campuses[0]?.id || "");
      setMinistry(existingService.ministry_type);
      setServiceName(existingService.service_name);
      setServiceDate(existingService.service_date);
      setStartTime(existingService.start_time?.slice(0, 5) || "");
      setEndTime(existingService.end_time?.slice(0, 5) || "");
      setSoundCheckTime(existingService.sound_check_time?.slice(0, 5) || "");
      setRepeatsWeekly(existingService.repeats_weekly);
    } else {
      setCampusId(campuses[0]?.id || "");
      setMinistry("weekend");
      setServiceName("");
      setServiceDate(new Date().toISOString().split("T")[0]);
      setStartTime("");
      setEndTime("");
      setSoundCheckTime("");
      setRepeatsWeekly(false);
    }
    setRoster([]);
    setRosterInitialized(!existingService);
    setPendingMemberId("");
    setPendingRoles([]);
    setSaving(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, existingService?.id]);

  // In edit mode, seed the roster from saved assignments once they load.
  useEffect(() => {
    if (!open || !isEditMode || rosterInitialized) return;
    const grouped = new Map<string, RosterEntry>();
    for (const assignment of existingAssignments) {
      const entry = grouped.get(assignment.user_id) || {
        userId: assignment.user_id,
        userName: assignment.profiles?.full_name || "Unnamed Member",
        roles: [],
      };
      if (!entry.roles.includes(assignment.role)) entry.roles.push(assignment.role);
      grouped.set(assignment.user_id, entry);
    }
    setRoster(Array.from(grouped.values()));
    setRosterInitialized(true);
  }, [open, isEditMode, rosterInitialized, existingAssignments]);

  const pendingMember = campusMembers.find((member) => member.id === pendingMemberId);
  const pendingMemberBreak = pendingMemberId ? breakStatuses?.get(pendingMemberId) : undefined;

  const pendingRoleSummary =
    pendingRoles.length === 0
      ? "Select role(s)"
      : pendingRoles.length === 1
        ? roleLabel(pendingRoles[0])
        : `${pendingRoles.length} roles selected`;

  const breakBadgeText = (status: BreakStatus | undefined) => {
    if (!status) return null;
    if (status.blackoutOnDate) return "Blackout on this date";
    if (status.onBreak) return status.pending ? "Break requested" : "On break";
    return null;
  };

  const togglePendingRole = (role: TeamPosition) => {
    setPendingRoles((prev) => (prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]));
  };

  const addPendingMember = () => {
    if (!pendingMemberId || pendingRoles.length === 0) return;
    setRoster((prev) => {
      const existing = prev.find((entry) => entry.userId === pendingMemberId);
      if (existing) {
        return prev.map((entry) =>
          entry.userId === pendingMemberId
            ? { ...entry, roles: Array.from(new Set([...entry.roles, ...pendingRoles])) }
            : entry,
        );
      }
      return [
        ...prev,
        {
          userId: pendingMemberId,
          userName: pendingMember?.full_name || "Unnamed Member",
          roles: [...pendingRoles],
        },
      ];
    });
    setPendingMemberId("");
    setPendingRoles([]);
  };

  const removeRole = (userId: string, role: TeamPosition) => {
    setRoster((prev) =>
      prev
        .map((entry) =>
          entry.userId === userId ? { ...entry, roles: entry.roles.filter((r) => r !== role) } : entry,
        )
        .filter((entry) => entry.roles.length > 0),
    );
  };

  const removeMember = (userId: string) => {
    setRoster((prev) => prev.filter((entry) => entry.userId !== userId));
  };

  const copyTeamRoster = (rosterKey: string) => {
    const team = copyableRosters.find((roster) => roster.key === rosterKey);
    if (!team) return;
    setRoster((prev) => {
      const next = [...prev];
      for (const member of team.members) {
        const existing = next.find((entry) => entry.userId === member.userId);
        if (existing) {
          if (!existing.roles.includes(member.role)) existing.roles.push(member.role);
        } else {
          next.push({ userId: member.userId, userName: member.name, roles: [member.role] });
        }
      }
      return next;
    });
  };

  const overriddenMembers = roster.filter((entry) => breakBadgeText(breakStatuses?.get(entry.userId)));

  const canSave = !!campusId && !!serviceName.trim() && !!serviceDate && !saving;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const flattenedAssignments = roster.flatMap((entry) =>
        entry.roles.map((role) => ({ user_id: entry.userId, role })),
      );

      if (isEditMode && existingService) {
        await updateCustomService.mutateAsync({
          id: existingService.id,
          service_name: serviceName.trim(),
          service_date: serviceDate,
          start_time: startTime || null,
          end_time: endTime || null,
          sound_check_time: soundCheckTime || null,
          repeats_weekly: repeatsWeekly,
        });

        const keptPairs = new Set(
          flattenedAssignments.map((assignment) => `${assignment.user_id}:${assignment.role}`),
        );
        const removeAssignmentIds = existingAssignments
          .filter((assignment) => !keptPairs.has(`${assignment.user_id}:${assignment.role}`))
          .map((assignment) => assignment.id);

        await saveRoster.mutateAsync({
          custom_service_id: existingService.id,
          assignment_date: serviceDate,
          assignments: flattenedAssignments,
          removeAssignmentIds,
        });
      } else {
        const created = await createCustomService.mutateAsync({
          campus_id: campusId,
          ministry_type: ministry,
          service_name: serviceName.trim(),
          service_date: serviceDate,
          start_time: startTime || null,
          end_time: endTime || null,
          sound_check_time: soundCheckTime || null,
          repeats_weekly: repeatsWeekly,
          repeat_until: null,
        });

        const service = created[0];
        if (service && flattenedAssignments.length > 0) {
          await saveRoster.mutateAsync({
            custom_service_id: service.id,
            assignment_date: serviceDate,
            assignments: flattenedAssignments,
          });
        }
      }

      onOpenChange(false);
    } catch {
      // Mutation hooks surface their own error toasts.
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEditMode ? "Edit Custom Service" : "New Custom Service"}</DialogTitle>
          <DialogDescription>
            Set the service details and build its team in one place. Assignments here override break requests
            for this service only.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Service details */}
          <div className="space-y-3">
            <p className="text-sm font-semibold">Service Details</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Campus</Label>
                <Select value={campusId} onValueChange={setCampusId} disabled={isEditMode}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select campus" />
                  </SelectTrigger>
                  <SelectContent>
                    {campuses.map((campus) => (
                      <SelectItem key={campus.id} value={campus.id}>
                        {campus.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Ministry</Label>
                <Select value={ministry} onValueChange={setMinistry} disabled={isEditMode}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SET_PLANNER_MINISTRY_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label>Service Name</Label>
                <Input
                  value={serviceName}
                  onChange={(e) => setServiceName(e.target.value)}
                  placeholder="Night of Worship"
                />
              </div>

              <div className="space-y-1.5">
                <Label>Date</Label>
                <Input type="date" value={serviceDate} onChange={(e) => setServiceDate(e.target.value)} />
              </div>

              <div className="space-y-1.5">
                <Label>Sound Check / Call Time</Label>
                <Input type="time" value={soundCheckTime} onChange={(e) => setSoundCheckTime(e.target.value)} />
              </div>

              <div className="space-y-1.5">
                <Label>Start Time</Label>
                <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              </div>

              <div className="space-y-1.5">
                <Label>End Time</Label>
                <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="builder-repeat-weekly"
                checked={repeatsWeekly}
                onCheckedChange={(checked) => setRepeatsWeekly(Boolean(checked))}
              />
              <Label htmlFor="builder-repeat-weekly" className="font-normal">
                Repeat this service weekly
              </Label>
            </div>
          </div>

          {/* Team */}
          <div className="space-y-3 border-t border-border pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <Users className="h-4 w-4" />
                Team for This Service
              </p>
              {copyableRosters.length > 0 && (
                <Select value="" onValueChange={copyTeamRoster}>
                  <SelectTrigger className="h-8 w-[200px] text-xs">
                    <SelectValue placeholder="Copy roster from team…" />
                  </SelectTrigger>
                  <SelectContent>
                    {copyableRosters.map((team) => (
                      <SelectItem key={team.key} value={team.key}>
                        {team.label} ({team.members.length})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="grid gap-2 sm:grid-cols-[1fr_180px_auto]">
              <Select value={pendingMemberId} onValueChange={setPendingMemberId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select team member" />
                </SelectTrigger>
                <SelectContent>
                  {campusMembers.map((member) => {
                    const badge = breakBadgeText(breakStatuses?.get(member.id));
                    const supportHint = supportMinistryHint(member.ministry_types || []);
                    return (
                      <SelectItem key={member.id} value={member.id}>
                        {member.full_name || "Unnamed Member"}
                        {supportHint ? ` • ${supportHint}` : ""}
                        {badge ? ` • ${badge}` : ""}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>

              <Popover open={rolePopoverOpen} onOpenChange={setRolePopoverOpen}>
                <PopoverTrigger asChild>
                  <Button type="button" variant="outline" className="justify-between">
                    <span className="truncate">{pendingRoleSummary}</span>
                    <span className="text-xs text-muted-foreground">▼</span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[260px] p-0" align="start">
                  <div className="border-b px-3 py-2">
                    <p className="text-sm font-medium">Assign Role(s)</p>
                    <p className="text-xs text-muted-foreground">Select one or more roles</p>
                  </div>
                  <div className="max-h-[260px] overflow-y-auto p-1">
                    {ROLE_OPTIONS.map((role) => {
                      const checked = pendingRoles.includes(role.value);
                      return (
                        <button
                          key={role.value}
                          type="button"
                          onClick={() => togglePendingRole(role.value)}
                          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted"
                        >
                          <Checkbox checked={checked} />
                          <span className="text-sm">{role.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </PopoverContent>
              </Popover>

              <Button
                type="button"
                onClick={addPendingMember}
                disabled={!pendingMemberId || pendingRoles.length === 0}
                className="gap-1"
              >
                <Plus className="h-4 w-4" />
                Add
              </Button>
            </div>

            {pendingMemberBreak && breakBadgeText(pendingMemberBreak) && (
              <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                <p>
                  <span className="font-medium">{pendingMember?.full_name || "This member"}</span>{" "}
                  {pendingMemberBreak.blackoutOnDate
                    ? "has a blackout on this date."
                    : pendingMemberBreak.requestType === "willing_break"
                      ? "is on a break this trimester (marked willing to serve if needed)."
                      : "requested a break this trimester."}{" "}
                  You can still add them — this assignment overrides their break for this service only.
                </p>
              </div>
            )}

            {roster.length === 0 ? (
              <p className="text-sm text-muted-foreground">No one assigned yet. Add members or copy a team roster.</p>
            ) : (
              <div className="space-y-2">
                {roster.map((entry) => {
                  const badge = breakBadgeText(breakStatuses?.get(entry.userId));
                  return (
                    <div key={entry.userId} className="rounded-md border border-border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <p className="truncate text-sm font-medium">{entry.userName}</p>
                          {badge && (
                            <Badge variant="outline" className="shrink-0 border-amber-500/60 text-xs text-amber-600">
                              {badge}
                            </Badge>
                          )}
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => removeMember(entry.userId)}
                          aria-label={`Remove ${entry.userName}`}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {entry.roles.map((role) => (
                          <Badge key={role} variant="secondary" className="pr-1 text-xs">
                            {roleLabel(role)}
                            <button
                              type="button"
                              className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded hover:bg-black/10"
                              onClick={() => removeRole(entry.userId, role)}
                              aria-label={`Remove ${roleLabel(role)} role`}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {overriddenMembers.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {overriddenMembers.length === 1
                  ? `${overriddenMembers[0].userName} is serving despite a break or blackout.`
                  : `${overriddenMembers.length} people are serving despite a break or blackout.`}
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={!canSave} className="gap-2">
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : isEditMode ? (
              "Save Changes"
            ) : (
              "Create Service & Team"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
