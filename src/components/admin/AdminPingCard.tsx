import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Megaphone, Search, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { useCampuses } from "@/hooks/useCampuses";
import { useProfiles } from "@/hooks/useProfiles";
import { useUserRoles } from "@/hooks/useUserRoles";
import { useActiveCampMode } from "@/hooks/useCampMode";
import { supabase } from "@/integrations/supabase/client";
import { SET_PLANNER_MINISTRY_OPTIONS, STUDENT_RESOURCE_APP_KEYS, STUDENT_TEAM_BUILDER_MINISTRY_TYPE } from "@/lib/constants";
import { getCurrentResourceAppKey } from "@/lib/resourceApp";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type RecipientPreview = {
  id: string;
  full_name: string | null;
  gender: string | null;
};

type MinistryOption = {
  value: string;
  label: string;
};

const GENDER_OPTIONS = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
];

const GLOBAL_PING_SENDER_ROLES = new Set([
  "admin",
  "network_worship_pastor",
  "network_worship_leader",
  "network_student_pastor",
  "campus_worship_pastor",
  "student_pastor",
  "student_worship_pastor",
  "childrens_pastor",
]);

function toggleValue(values: string[], value: string, checked: boolean) {
  return checked ? Array.from(new Set([...values, value])) : values.filter((entry) => entry !== value);
}

function toggleNumber(values: number[], value: number, checked: boolean) {
  return checked ? Array.from(new Set([...values, value])).sort((a, b) => a - b) : values.filter((entry) => entry !== value);
}

async function getFunctionErrorMessage(error: unknown, fallback: string) {
  const context = typeof error === "object" && error !== null && "context" in error
    ? (error as { context?: unknown }).context
    : null;

  if (context instanceof Response) {
    const response = context.clone();
    try {
      const payload = await response.json();
      if (payload && typeof payload.error === "string") return payload.error;
      if (payload && typeof payload.message === "string") return payload.message;
    } catch {
      try {
        const text = await context.clone().text();
        if (text.trim()) return text.trim();
      } catch {
        // Fall through to the generic function error message.
      }
    }
  }

  return error instanceof Error ? error.message : fallback;
}

export function AdminPingCard() {
  const { user } = useAuth();
  const resourceAppKey = getCurrentResourceAppKey();
  const isStudentApp = STUDENT_RESOURCE_APP_KEYS.includes(resourceAppKey);
  const { data: campuses = [] } = useCampuses();
  const { data: profiles = [] } = useProfiles();
  const { data: userRoles = [] } = useUserRoles(user?.id);
  const { data: activeCamp } = useActiveCampMode();
  const [campusId, setCampusId] = useState<string>("all");
  const [useCampAudience, setUseCampAudience] = useState(false);
  const [selectedMinistries, setSelectedMinistries] = useState<string[]>([]);
  const [selectedGenders, setSelectedGenders] = useState<string[]>([]);
  const [selectedGrades, setSelectedGrades] = useState<number[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [nameSearch, setNameSearch] = useState("");
  const [title, setTitle] = useState("Leader Ping");
  const [message, setMessage] = useState("");
  const [previewRecipients, setPreviewRecipients] = useState<RecipientPreview[]>([]);
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [previewPushEligibleCount, setPreviewPushEligibleCount] = useState<number | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isSending, setIsSending] = useState(false);

  const teamsQuery = useQuery({
    queryKey: ["admin-ping-teams", resourceAppKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("worship_teams")
        .select("id, name")
        .eq("resource_app_key", resourceAppKey)
        .order("name", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  const ministryOptions = useMemo<MinistryOption[]>(() => {
    const baseOptions: MinistryOption[] = isStudentApp
      ? [
          { value: STUDENT_TEAM_BUILDER_MINISTRY_TYPE, label: "Students" },
          { value: "life_groups", label: "Life Groups" },
        ]
      : SET_PLANNER_MINISTRY_OPTIONS.map((option) => ({ value: option.value, label: option.label }));

    const teamOptions = (teamsQuery.data || []).map((team) => ({
      value: `team:${team.id}`,
      label: team.name,
    }));

    const optionsByValue = new Map<string, MinistryOption>();
    [...baseOptions, ...teamOptions].forEach((option) => {
      optionsByValue.set(option.value, option);
    });
    return Array.from(optionsByValue.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [isStudentApp, teamsQuery.data]);

  const gradeOptions = isStudentApp
    ? useCampAudience && activeCamp
      ? [8, 9, 10, 11, 12]
      : resourceAppKey === "students_ms"
        ? [8]
        : [9, 10, 11, 12]
    : [];

  const selectedProfiles = useMemo(
    () => profiles.filter((profile) => selectedUserIds.includes(profile.id)),
    [profiles, selectedUserIds],
  );

  const adminCampusIds = useMemo(
    () => userRoles
      .filter((role) => role.role === "campus_admin" && role.admin_campus_id)
      .map((role) => role.admin_campus_id as string),
    [userRoles],
  );

  const isCampusScopedSender = useMemo(() => {
    if (!userRoles.some((role) => role.role === "campus_admin")) return false;
    return !userRoles.some((role) => GLOBAL_PING_SENDER_ROLES.has(role.role));
  }, [userRoles]);

  useEffect(() => {
    if (campusId !== "all" || !isCampusScopedSender || adminCampusIds.length === 0) return;
    setCampusId(adminCampusIds[0]);
  }, [adminCampusIds, campusId, isCampusScopedSender]);

  const filteredProfiles = useMemo(() => {
    const query = nameSearch.trim().toLowerCase();
    if (!query) return profiles.slice(0, 20);
    return profiles
      .filter((profile) => (profile.full_name || "").toLowerCase().includes(query))
      .sort((a, b) => (a.full_name || "").localeCompare(b.full_name || ""))
      .slice(0, 20);
  }, [nameSearch, profiles]);

  const payload = {
    resourceAppKey,
    campInstanceId: useCampAudience ? activeCamp?.id || null : null,
    campusId: campusId === "all" ? null : campusId,
    ministryKeys: selectedMinistries,
    genders: selectedGenders,
    grades: selectedGrades,
    userIds: selectedUserIds,
    title: title.trim() || "Leader Ping",
    message: message.trim(),
  };

  const preview = async () => {
    setIsPreviewing(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-admin-ping", {
        body: { ...payload, dryRun: true },
      });
      if (error) throw error;
      setPreviewCount(data?.recipients ?? 0);
      setPreviewPushEligibleCount(data?.pushEligibleRecipients ?? null);
      setPreviewRecipients(data?.recipientPreviews || []);
    } catch (error) {
      const errorMessage = await getFunctionErrorMessage(error, "Unable to preview recipients");
      toast.error(errorMessage);
    } finally {
      setIsPreviewing(false);
    }
  };

  const sendPing = async () => {
    if (!message.trim()) {
      toast.error("Write a message before sending.");
      return;
    }

    setIsSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-admin-ping", {
        body: payload,
      });
      if (error) throw error;
      toast.success("Ping sent.", {
        description: `${data?.recipients || 0} leader${data?.recipients === 1 ? "" : "s"} matched. ${data?.pushSent || 0} push notification${data?.pushSent === 1 ? "" : "s"} delivered.`,
      });
      setMessage("");
      setPreviewCount(null);
      setPreviewPushEligibleCount(null);
      setPreviewRecipients([]);
    } catch (error) {
      const errorMessage = await getFunctionErrorMessage(error, "Unable to send ping");
      toast.error(errorMessage);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Card className="mb-6">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-xl font-semibold">
          <Megaphone className="h-5 w-5 text-primary" />
          Ping Leaders
        </CardTitle>
        <CardDescription>
          Send an in-the-moment push and in-app notification to leaders by ministry, gender, grade, or name.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Campus</Label>
            <Select value={campusId} onValueChange={setCampusId}>
              <SelectTrigger>
                <SelectValue placeholder="All campuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All campuses</SelectItem>
                {campuses.map((campus) => (
                  <SelectItem key={campus.id} value={campus.id}>
                    {campus.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Title</Label>
            <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Leader Ping" />
          </div>
        </div>

        {isStudentApp && activeCamp ? (
          <label className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm">
            <Checkbox
              checked={useCampAudience}
              onCheckedChange={(checked) => setUseCampAudience(checked === true)}
            />
            <span>
              <span className="block font-medium text-foreground">Send to Camp Mode audience</span>
              <span className="text-muted-foreground">
                Target leaders across the MS and HS apps participating in {activeCamp.name}.
              </span>
            </span>
          </label>
        ) : null}

        <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
          <div className="space-y-3">
            <Label>Ministry</Label>
            <div className="grid max-h-52 gap-2 overflow-y-auto rounded-md border border-border p-3 sm:grid-cols-2">
              {ministryOptions.map((option) => (
                <label key={option.value} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={selectedMinistries.includes(option.value)}
                    onCheckedChange={(checked) =>
                      setSelectedMinistries((current) => toggleValue(current, option.value, Boolean(checked)))
                    }
                  />
                  <span className="truncate">{option.label}</span>
                </label>
              ))}
              {ministryOptions.length === 0 && (
                <p className="text-sm text-muted-foreground">No ministries found.</p>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <Label>People</Label>
            <p className="text-xs text-muted-foreground">
              Selecting people sends only to those selected leaders.
            </p>
            <div className="rounded-md border border-border">
              <div className="flex items-center gap-2 border-b border-border px-3">
                <Search className="h-4 w-4 text-muted-foreground" />
                <Input
                  value={nameSearch}
                  onChange={(event) => setNameSearch(event.target.value)}
                  placeholder="Search leaders by name"
                  className="border-0 px-0 focus-visible:ring-0"
                />
              </div>
              <ScrollArea className="h-40">
                <div className="space-y-1 p-2">
                  {filteredProfiles.map((profile) => (
                    <label
                      key={profile.id}
                      className={cn(
                        "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted",
                        selectedUserIds.includes(profile.id) && "bg-primary/5",
                      )}
                    >
                      <Checkbox
                        checked={selectedUserIds.includes(profile.id)}
                        onCheckedChange={(checked) =>
                          setSelectedUserIds((current) => toggleValue(current, profile.id, Boolean(checked)))
                        }
                      />
                      <span className="min-w-0 flex-1 truncate">{profile.full_name || "Unnamed profile"}</span>
                      {profile.gender && <Badge variant="outline">{profile.gender}</Badge>}
                    </label>
                  ))}
                </div>
              </ScrollArea>
            </div>
            {selectedProfiles.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {selectedProfiles.map((profile) => (
                  <Badge key={profile.id} variant="secondary">
                    {profile.full_name || "Unnamed"}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-3">
            <Label>Gender</Label>
            <div className="flex flex-wrap gap-3">
              {GENDER_OPTIONS.map((option) => (
                <label key={option.value} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={selectedGenders.includes(option.value)}
                    onCheckedChange={(checked) =>
                      setSelectedGenders((current) => toggleValue(current, option.value, Boolean(checked)))
                    }
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </div>
          {gradeOptions.length > 0 && (
            <div className="space-y-3">
              <Label>Grade</Label>
              <div className="flex flex-wrap gap-3">
                {gradeOptions.map((grade) => (
                  <label key={grade} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={selectedGrades.includes(grade)}
                      onCheckedChange={(checked) =>
                        setSelectedGrades((current) => toggleNumber(current, grade, Boolean(checked)))
                      }
                    />
                    {grade}th
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label>Message</Label>
          <Textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Need a quick response from leaders..."
            rows={4}
            maxLength={500}
          />
          <p className="text-xs text-muted-foreground">{message.length}/500 characters</p>
        </div>

        {previewCount !== null && (
          <div className="rounded-md border border-border bg-muted/40 p-3">
            <p className="text-sm font-medium">
              {previewCount} leader{previewCount === 1 ? "" : "s"} matched
            </p>
            {previewRecipients.length > 0 && (
              <p className="mt-1 text-sm text-muted-foreground">
                {previewRecipients.map((recipient) => recipient.full_name || "Unnamed").join(", ")}
                {previewCount > previewRecipients.length ? `, and ${previewCount - previewRecipients.length} more` : ""}
              </p>
            )}
            {previewPushEligibleCount !== null && previewPushEligibleCount < previewCount && (
              <p className="mt-2 text-sm text-amber-700">
                {previewPushEligibleCount} of {previewCount} matched leader{previewCount === 1 ? "" : "s"} have push enabled for this app.
              </p>
            )}
          </div>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={preview} disabled={isPreviewing || isSending}>
            {isPreviewing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
            Preview
          </Button>
          <Button onClick={sendPing} disabled={isSending || isPreviewing || !message.trim()}>
            {isSending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            Send Ping
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
