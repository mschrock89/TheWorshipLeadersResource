import { useMemo, useState } from "react";
import { ShieldCheck, Trash2, Plus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { useCapabilities } from "@/hooks/useCapabilities";
import { useLeadershipRoles } from "@/hooks/useLeadershipRoles";
import { CAPABILITIES } from "@/lib/capabilities";
import { SET_PLANNER_MINISTRY_OPTIONS } from "@/lib/constants";
import {
  useCapabilitiesList,
  useRoleCapabilities,
  useToggleRoleCapability,
  useApprovalRules,
  useUpsertApprovalRule,
  useDeleteApprovalRule,
  useUserOverrides,
  useSetUserOverride,
  useRemoveUserOverride,
  useBasicProfiles,
  useCampusList,
  type ResourceAppScope,
} from "@/hooks/usePermissionsAdmin";

// The 22-role app_role enum, in the display order used across the app.
const APP_ROLES = [
  "admin",
  "campus_admin",
  "network_worship_pastor",
  "network_worship_leader",
  "campus_worship_pastor",
  "network_student_pastor",
  "student_pastor",
  "student_worship_pastor",
  "childrens_pastor",
  "campus_pastor",
  "speaker",
  "video_director",
  "production_manager",
  "creative_team_lead",
  "leader",
  "audition_candidate",
  "student",
  "ms_leader",
  "ms_leader_weekend",
  "hs_leader",
  "volunteer",
  "member",
] as const;

const RESOURCE_APPS: { value: ResourceAppScope; label: string }[] = [
  { value: "all", label: "All apps" },
  { value: "worship", label: "Worship" },
  { value: "students_hs", label: "Students HS" },
  { value: "students_ms", label: "Students MS" },
  { value: "my_church_resource", label: "Church Resource (Hub)" },
];

const prettyRole = (r: string) => r.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

// Radix Select can't use "" as an item value, so the "all ministries" default
// rule is represented by this sentinel and mapped back to null on save.
const DEFAULT_MINISTRY = "__default__";
const ministryLabel = (value: string | null) =>
  value
    ? SET_PLANNER_MINISTRY_OPTIONS.find((o) => o.value === value)?.label ?? value
    : "Default (all ministries)";

// Temporary-access options for per-user overrides.
const EXPIRY_OPTIONS = [
  { value: "never", label: "No expiry" },
  { value: "1", label: "Expires in 1 day" },
  { value: "7", label: "Expires in 7 days" },
  { value: "30", label: "Expires in 30 days" },
];
const computeExpiry = (v: string) =>
  v === "never" ? null : new Date(Date.now() + Number(v) * 86_400_000).toISOString();
const formatExpiry = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—";

function NotAuthorized() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 text-center">
      <ShieldCheck className="mx-auto h-10 w-10 text-muted-foreground" />
      <h1 className="mt-4 text-xl font-semibold">Permissions</h1>
      <p className="mt-2 text-muted-foreground">You don't have access to manage permissions.</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab 1: role × capability matrix
// ---------------------------------------------------------------------------
function MatrixTab() {
  const [scope, setScope] = useState<ResourceAppScope>("all");
  const { data: capabilities = [] } = useCapabilitiesList();
  const { data: grants = [] } = useRoleCapabilities();
  const toggle = useToggleRoleCapability();

  const granted = useMemo(() => {
    const set = new Set<string>();
    for (const g of grants) set.add(`${g.role}|${g.capability_key}|${g.resource_app}`);
    return set;
  }, [grants]);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-xl font-semibold">Capability matrix</CardTitle>
            <CardDescription>Grant each role the actions it should be able to perform.</CardDescription>
          </div>
          <div className="w-56">
            <Label className="text-xs text-muted-foreground">App scope</Label>
            <Select value={scope} onValueChange={(v) => setScope(v as ResourceAppScope)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {RESOURCE_APPS.map((a) => (
                  <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="sticky left-0 bg-background">Role</TableHead>
              {capabilities.map((c) => (
                <TableHead key={c.key} className="whitespace-nowrap text-center text-xs">
                  {c.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {APP_ROLES.map((role) => (
              <TableRow key={role}>
                <TableCell className="sticky left-0 bg-background font-medium whitespace-nowrap">
                  {prettyRole(role)}
                </TableCell>
                {capabilities.map((c) => {
                  const key = `${role}|${c.key}|${scope}`;
                  const isOn = granted.has(key);
                  return (
                    <TableCell key={c.key} className="text-center">
                      <Checkbox
                        checked={isOn}
                        disabled={toggle.isPending}
                        onCheckedChange={(v) =>
                          toggle.mutate({
                            role,
                            capability_key: c.key,
                            resource_app: scope,
                            grant: v === true,
                          })
                        }
                      />
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Tab 2: setlist approval rules
// ---------------------------------------------------------------------------
function ApprovalsTab() {
  const { data: rules = [] } = useApprovalRules();
  const { data: leadership } = useLeadershipRoles();
  const { data: campuses = [] } = useCampusList();
  const upsert = useUpsertApprovalRule();
  const del = useDeleteApprovalRule();

  const [newMinistry, setNewMinistry] = useState<string>(DEFAULT_MINISTRY);
  const [newApprover, setNewApprover] = useState<string>("");
  const [newRequires, setNewRequires] = useState(true);

  const dedupeById = (users: { id: string; full_name: string | null }[]) => {
    const map = new Map<string, { id: string; full_name: string | null }>();
    for (const u of users) if (!map.has(u.id)) map.set(u.id, u);
    return [...map.values()];
  };
  // Approvers are restricted to admin-level users (org + campus admins).
  const adminUsers = dedupeById([
    ...(leadership?.admins ?? []),
    ...(leadership?.campusAdmins ?? []),
  ]);
  // Broader leadership set — only used to resolve the name of an already-saved
  // approver who might sit outside the admin tier.
  const allLeaders = dedupeById([
    ...(leadership?.admins ?? []),
    ...(leadership?.campusAdmins ?? []),
    ...(leadership?.networkWorshipPastors ?? []),
    ...(leadership?.networkStudentPastors ?? []),
    ...(leadership?.worshipPastors ?? []),
  ]);
  // Selectable approver options for a rule, always including its current approver
  // so an existing selection never silently disappears from the dropdown.
  const approverOptions = (currentId: string | null) => {
    if (currentId && !adminUsers.some((u) => u.id === currentId)) {
      const cur = allLeaders.find((u) => u.id === currentId);
      return [{ id: currentId, full_name: cur?.full_name ?? "Current approver" }, ...adminUsers];
    }
    return adminUsers;
  };
  const campusName = (id: string | null) =>
    id ? campuses.find((c) => c.id === id)?.name || "Unknown campus" : "All campuses";

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl font-semibold">Setlist approvals</CardTitle>
          <CardDescription>
            Who reviews a planned set before it publishes, and which ministries skip review. Most
            specific rule wins (campus + ministry &gt; campus &gt; ministry &gt; default).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ministry</TableHead>
                <TableHead>Campus</TableHead>
                <TableHead>Requires approval</TableHead>
                <TableHead>Approver</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">
                    {r.ministry_type ? ministryLabel(r.ministry_type) : <Badge variant="secondary">Default</Badge>}
                  </TableCell>
                  <TableCell>{campusName(r.campus_id)}</TableCell>
                  <TableCell>
                    <Switch
                      checked={r.requires_approval}
                      onCheckedChange={(v) => upsert.mutate({ ...r, requires_approval: v })}
                    />
                  </TableCell>
                  <TableCell>
                    {r.requires_approval ? (
                      <Select
                        value={r.approver_user_id ?? ""}
                        onValueChange={(v) => upsert.mutate({ ...r, approver_user_id: v || null })}
                      >
                        <SelectTrigger className="w-56"><SelectValue placeholder="Choose approver" /></SelectTrigger>
                        <SelectContent>
                          {approverOptions(r.approver_user_id).map((p) => (
                            <SelectItem key={p.id} value={p.id}>{p.full_name || p.id}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className="text-muted-foreground">Auto-publishes</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => del.mutate(r.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Add or edit a ministry rule</CardTitle>
          <CardDescription>Pick a ministry, or the default to apply to every ministry without its own rule.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-4">
          <div className="grow">
            <Label className="text-xs text-muted-foreground">Ministry</Label>
            <Select value={newMinistry} onValueChange={setNewMinistry}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={DEFAULT_MINISTRY}>Default (all ministries)</SelectItem>
                {SET_PLANNER_MINISTRY_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 pb-2">
            <Switch checked={newRequires} onCheckedChange={setNewRequires} />
            <span className="text-sm">Requires approval</span>
          </div>
          {newRequires && (
            <div className="w-56">
              <Label className="text-xs text-muted-foreground">Approver</Label>
              <Select value={newApprover} onValueChange={setNewApprover}>
                <SelectTrigger><SelectValue placeholder="Choose approver" /></SelectTrigger>
                <SelectContent>
                  {approverOptions(newApprover || null).map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.full_name || p.id}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <Button
            disabled={upsert.isPending}
            onClick={() => {
              const ministry = newMinistry === DEFAULT_MINISTRY ? null : newMinistry;
              // Upsert by scope: if a rule already exists for this ministry (or the
              // default), edit it instead of inserting a duplicate (which the
              // unique scope index would reject).
              const existing = rules.find(
                (r) =>
                  r.resource_app === "worship" &&
                  r.campus_id === null &&
                  (r.ministry_type ?? null) === ministry,
              );
              upsert.mutate(
                existing
                  ? {
                      ...existing,
                      requires_approval: newRequires,
                      approver_user_id: newRequires ? newApprover || null : null,
                    }
                  : {
                      resource_app: "worship",
                      campus_id: null,
                      ministry_type: ministry,
                      requires_approval: newRequires,
                      approver_user_id: newRequires ? newApprover || null : null,
                    },
                { onSuccess: () => { setNewMinistry(DEFAULT_MINISTRY); setNewApprover(""); setNewRequires(true); } },
              );
            }}
          >
            <Plus className="mr-1 h-4 w-4" /> {newMinistry === DEFAULT_MINISTRY ? "Save default" : "Save rule"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab 3: per-user overrides
// ---------------------------------------------------------------------------
function OverridesTab() {
  const { data: profiles = [] } = useBasicProfiles();
  const { data: capabilities = [] } = useCapabilitiesList();
  const [userId, setUserId] = useState<string | null>(null);
  const { data: overrides = [] } = useUserOverrides(userId);
  const setOverride = useSetUserOverride();
  const removeOverride = useRemoveUserOverride();

  const [newCap, setNewCap] = useState("");
  const [newGranted, setNewGranted] = useState(true);
  const [newExpiry, setNewExpiry] = useState("never");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl font-semibold">Per-user overrides</CardTitle>
        <CardDescription>
          Grant or revoke a single capability for one person, on top of their roles — optionally with an
          expiry for temporary access.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="w-full max-w-sm">
          <Label className="text-xs text-muted-foreground">User</Label>
          <Select value={userId ?? ""} onValueChange={(v) => setUserId(v || null)}>
            <SelectTrigger><SelectValue placeholder="Select a user" /></SelectTrigger>
            <SelectContent>
              {profiles.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.full_name || p.id}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {userId && (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Capability</TableHead>
                  <TableHead>Scope</TableHead>
                  <TableHead>Effect</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {overrides.length === 0 && (
                  <TableRow><TableCell colSpan={5} className="text-muted-foreground">No overrides.</TableCell></TableRow>
                )}
                {overrides.map((o) => {
                  const expired = !!o.expires_at && new Date(o.expires_at).getTime() <= Date.now();
                  return (
                  <TableRow key={`${o.capability_key}|${o.resource_app}`}>
                    <TableCell className="font-medium">
                      {capabilities.find((c) => c.key === o.capability_key)?.label || o.capability_key}
                    </TableCell>
                    <TableCell>{o.resource_app}</TableCell>
                    <TableCell>
                      <Badge variant={o.granted ? "default" : "destructive"}>
                        {o.granted ? "Granted" : "Revoked"}
                      </Badge>
                    </TableCell>
                    <TableCell className={expired ? "text-destructive" : "text-muted-foreground"}>
                      {formatExpiry(o.expires_at)}{expired ? " (expired)" : ""}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          removeOverride.mutate({
                            user_id: o.user_id,
                            capability_key: o.capability_key,
                            resource_app: o.resource_app,
                          })
                        }
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            <div className="flex flex-wrap items-end gap-4 border-t pt-4">
              <div className="w-64">
                <Label className="text-xs text-muted-foreground">Capability</Label>
                <Select value={newCap} onValueChange={setNewCap}>
                  <SelectTrigger><SelectValue placeholder="Choose capability" /></SelectTrigger>
                  <SelectContent>
                    {capabilities.map((c) => (
                      <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2 pb-2">
                <Switch checked={newGranted} onCheckedChange={setNewGranted} />
                <span className="text-sm">{newGranted ? "Grant" : "Revoke"}</span>
              </div>
              {newGranted && (
                <div className="w-48">
                  <Label className="text-xs text-muted-foreground">Duration</Label>
                  <Select value={newExpiry} onValueChange={setNewExpiry}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {EXPIRY_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <Button
                disabled={!newCap || setOverride.isPending}
                onClick={() =>
                  setOverride.mutate(
                    {
                      user_id: userId,
                      capability_key: newCap,
                      resource_app: "all",
                      granted: newGranted,
                      expires_at: newGranted ? computeExpiry(newExpiry) : null,
                    },
                    { onSuccess: () => { setNewCap(""); setNewExpiry("never"); } },
                  )
                }
              >
                <Plus className="mr-1 h-4 w-4" /> Apply
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function PermissionsAdmin() {
  const { can, isLoading } = useCapabilities();

  if (isLoading) {
    return <div className="px-4 py-16 text-center text-muted-foreground">Loading…</div>;
  }
  if (!can(CAPABILITIES.MANAGE_PERMISSIONS)) {
    return <NotAuthorized />;
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex items-center gap-2">
        <ShieldCheck className="h-6 w-6 text-primary" />
        <h1 className="font-display text-3xl font-bold text-foreground">Permissions</h1>
      </div>
      <Tabs defaultValue="matrix">
        <TabsList>
          <TabsTrigger value="matrix">Role matrix</TabsTrigger>
          <TabsTrigger value="approvals">Set approvals</TabsTrigger>
          <TabsTrigger value="overrides">User overrides</TabsTrigger>
        </TabsList>
        <TabsContent value="matrix" className="mt-4"><MatrixTab /></TabsContent>
        <TabsContent value="approvals" className="mt-4"><ApprovalsTab /></TabsContent>
        <TabsContent value="overrides" className="mt-4"><OverridesTab /></TabsContent>
      </Tabs>
    </div>
  );
}
