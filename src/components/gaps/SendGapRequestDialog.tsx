import { useEffect, useMemo, useState } from "react";
import { Loader2, Megaphone, Search, Users } from "lucide-react";
import { toast } from "sonner";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { useCampuses, useUserCampuses } from "@/hooks/useCampuses";
import { useCampusMinistrySet } from "@/hooks/useCampusMinistries";
import { campusOffersMinistry } from "@/lib/campusSetup";
import {
  type GapCandidate,
  usePreviewGapRecipients,
  useSendGapRequest,
} from "@/hooks/useGapRequests";
import { cn } from "@/lib/cn";
import { getMinistryLabel, getTeamBuilderSlotCategories, MINISTRY_TYPES, POSITION_SLOTS } from "@/lib/constants";
import { formatGapDate, formatGapPosition } from "@/lib/gapRequests";
import { getWeekendPairDate, isWeekend } from "@/lib/utils";

const MINISTRY_OPTIONS = MINISTRY_TYPES.filter((ministry) => !("hidden" in ministry && ministry.hidden));

function slotOptionsForMinistry(ministryType: string) {
  const categories = new Set(getTeamBuilderSlotCategories(ministryType));
  return POSITION_SLOTS.filter((slot) => categories.has(slot.category));
}

function churchToday() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
}

function toggle(values: string[], value: string, checked: boolean) {
  return checked ? Array.from(new Set([...values, value])) : values.filter((item) => item !== value);
}

function CheckGrid({
  label,
  options,
  selected,
  onChange,
  columns = 2,
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (next: string[]) => void;
  columns?: 1 | 2;
}) {
  const selectedCount = options.filter((option) => selected.includes(option.value)).length;
  const allSelected = options.length > 0 && selectedCount === options.length;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
          <span className="ml-1.5 tabular-nums normal-case tracking-normal text-foreground/80">
            {selectedCount}/{options.length}
          </span>
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() => onChange(allSelected ? [] : options.map((option) => option.value))}
        >
          {allSelected ? "Clear" : "All"}
        </Button>
      </div>
      <div className={cn("grid gap-1.5", columns === 1 ? "grid-cols-1" : "grid-cols-2")}>
        {options.map((option) => {
          const checked = selected.includes(option.value);
          return (
            <label
              key={option.value}
              className={cn(
                "flex min-h-10 cursor-pointer items-center gap-2 rounded-md border px-2.5 py-2 text-sm leading-snug transition-colors",
                checked
                  ? "border-primary/40 bg-primary/10 text-foreground"
                  : "border-border/80 bg-background/40 text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
            >
              <Checkbox
                checked={checked}
                onCheckedChange={(next) => onChange(toggle(selected, option.value, next === true))}
              />
              <span className="min-w-0">{option.label}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

export interface SendGapRequestDefaults {
  campusId?: string;
  ministryType?: string;
  scheduleDate?: string;
  positionSlot?: string;
  coversWeekendPair?: boolean;
  message?: string;
  /** People who already can't cover this date, such as the volunteer who asked to swap. */
  excludeUserIds?: string[];
}

export function SendGapRequestDialog({
  open,
  onOpenChange,
  defaults,
  intro,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaults?: SendGapRequestDefaults;
  intro?: string;
}) {
  const { user, isAdmin } = useAuth();
  const { data: allCampuses = [] } = useCampuses();
  const { data: userCampuses = [] } = useUserCampuses(user?.id);
  const preview = usePreviewGapRecipients();
  const send = useSendGapRequest();

  const [campusId, setCampusId] = useState("");
  const [ministryType, setMinistryType] = useState("weekend_team");
  const [scheduleDate, setScheduleDate] = useState("");
  const [positionSlot, setPositionSlot] = useState("");
  const [coversWeekendPair, setCoversWeekendPair] = useState(true);
  const [targetCampusIds, setTargetCampusIds] = useState<string[]>([]);
  const [targetMinistryTypes, setTargetMinistryTypes] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [excludeUserIds, setExcludeUserIds] = useState<string[]>([]);
  const [candidates, setCandidates] = useState<GapCandidate[] | null>(null);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const { enabled: campusMinistries } = useCampusMinistrySet(campusId || null);
  const ministryOptions = useMemo(
    () => MINISTRY_OPTIONS.filter((ministry) =>
      ministry.value === ministryType
      || targetMinistryTypes.includes(ministry.value)
      || campusOffersMinistry(campusMinistries, ministry.value),
    ),
    [campusMinistries, ministryType, targetMinistryTypes],
  );

  const myCampuses = useMemo(
    () => userCampuses.map((entry) => entry.campuses).filter(Boolean),
    [userCampuses],
  );
  const gapCampusOptions = isAdmin || myCampuses.length === 0 ? allCampuses : myCampuses;
  const selectableCampusIds = useMemo(
    () => new Set(gapCampusOptions.map((campus) => campus.id)),
    [gapCampusOptions],
  );
  const slotOptions = useMemo(() => slotOptionsForMinistry(ministryType), [ministryType]);
  const position = POSITION_SLOTS.find((slot) => slot.slot === positionSlot)?.position || "";
  const pairDate = scheduleDate && isWeekend(scheduleDate) ? getWeekendPairDate(scheduleDate) : null;

  useEffect(() => {
    if (!open) return;
    const assignedDefault = myCampuses.find((campus) => campus.id === defaults?.campusId);
    const initialCampus =
      (defaults?.campusId && !assignedDefault?.is_network_wide ? defaults.campusId : "") ||
      myCampuses.find((campus) => !campus.is_network_wide)?.id ||
      "";
    const initialMinistry = defaults?.ministryType || "weekend_team";
    setCampusId(initialCampus);
    setMinistryType(initialMinistry);
    setScheduleDate(defaults?.scheduleDate || "");
    setPositionSlot(defaults?.positionSlot || "");
    setCoversWeekendPair(defaults?.coversWeekendPair !== false);
    setTargetCampusIds(initialCampus ? [initialCampus] : []);
    setTargetMinistryTypes([initialMinistry]);
    setMessage(defaults?.message || "");
    setExcludeUserIds(defaults?.excludeUserIds || []);
    setCandidates(null);
    setSelectedUserIds([]);
    setSearch("");
    // Only reset when the dialog opens; campus data arriving later shouldn't wipe edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Network Wide is not a campus you can schedule a gap for. Drop it once the
  // real campus list is loaded, and fill in the person's first physical campus.
  useEffect(() => {
    if (!open || selectableCampusIds.size === 0) return;
    if (campusId && selectableCampusIds.has(campusId)) return;
    const fallback = myCampuses.find((campus) => !campus.is_network_wide && selectableCampusIds.has(campus.id))?.id || "";
    if (campusId !== fallback) setCampusId(fallback);
    setTargetCampusIds((current) => {
      const kept = current.filter((id) => selectableCampusIds.has(id));
      if (kept.length) return kept;
      return fallback ? [fallback] : [];
    });
  }, [open, campusId, myCampuses, selectableCampusIds]);

  // Any change to who we're reaching invalidates the previewed list.
  useEffect(() => {
    setCandidates(null);
    setSelectedUserIds([]);
  }, [campusId, ministryType, scheduleDate, positionSlot, targetCampusIds, targetMinistryTypes]);

  const handleCampusChange = (value: string) => {
    setTargetCampusIds((current) => (current.includes(campusId) && current.length === 1 ? [value] : toggle(current, value, true)));
    setCampusId(value);
  };

  const handleMinistryChange = (value: string) => {
    setTargetMinistryTypes((current) =>
      current.includes(ministryType) && current.length === 1 ? [value] : toggle(current, value, true),
    );
    setMinistryType(value);
    if (!slotOptionsForMinistry(value).some((slot) => slot.slot === positionSlot)) setPositionSlot("");
  };

  const canPreview =
    Boolean(campusId && ministryType && scheduleDate && position) &&
    targetCampusIds.length > 0 &&
    targetMinistryTypes.length > 0 &&
    scheduleDate >= churchToday();

  const draft = { campusId, ministryType, scheduleDate, position, targetCampusIds, targetMinistryTypes };

  const handlePreview = async () => {
    try {
      const excluded = new Set(excludeUserIds);
      const result = (await preview.mutateAsync(draft)).filter((candidate) => !excluded.has(candidate.id));
      setCandidates(result);
      setSelectedUserIds(result.map((candidate) => candidate.id));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't load volunteers");
    }
  };

  const handleSend = async () => {
    try {
      const result = await send.mutateAsync({
        ...draft,
        positionSlot,
        coversWeekendPair: Boolean(pairDate) && coversWeekendPair,
        message: message.trim() || undefined,
        userIds: selectedUserIds,
      });
      toast.success(
        `Gap request sent to ${result.notified} ${result.notified === 1 ? "volunteer" : "volunteers"}`,
      );
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't send the gap request");
    }
  };

  const visibleCandidates = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!candidates) return [];
    if (!query) return candidates;
    return candidates.filter((candidate) => (candidate.full_name || "").toLowerCase().includes(query));
  }, [candidates, search]);

  const positionLabel = position ? formatGapPosition(position) : "matching";
  const previewBlocker = !scheduleDate
    ? "Pick the date of the gap."
    : scheduleDate < churchToday()
      ? "That date has already passed."
      : !campusId
        ? "Choose the campus with the gap."
        : !position
          ? "Choose the open slot."
          : targetCampusIds.length === 0
            ? "Choose at least one campus to notify."
            : targetMinistryTypes.length === 0
              ? "Choose at least one ministry to notify."
              : null;
  const readyToSend = Boolean(candidates?.length) && selectedUserIds.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100dvh-1.5rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg sm:p-0">
        <DialogHeader className="shrink-0 space-y-1 px-5 pb-3 pr-12 pt-5 text-left sm:px-6 sm:pt-6">
          <DialogTitle className="flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-primary" />
            Send a Gap Request
          </DialogTitle>
          <DialogDescription>
            {intro || "Volunteers get a notification and can answer Yes or No. You approve who is added to the roster."}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-1 sm:px-6">
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="gap-date">Date</Label>
                <Input
                  id="gap-date"
                  type="date"
                  min={churchToday()}
                  value={scheduleDate}
                  onChange={(event) => setScheduleDate(event.target.value)}
                  className="text-left text-sm [color-scheme:dark]"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Campus with the gap</Label>
                <Select
                  value={campusId && selectableCampusIds.has(campusId) ? campusId : undefined}
                  onValueChange={handleCampusChange}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose campus" />
                  </SelectTrigger>
                  <SelectContent>
                    {gapCampusOptions.map((campus) => (
                      <SelectItem key={campus.id} value={campus.id}>
                        {campus.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Ministry</Label>
                <Select value={ministryType} onValueChange={handleMinistryChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ministryOptions.map((ministry) => (
                      <SelectItem key={ministry.value} value={ministry.value}>
                        {ministry.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Open slot</Label>
                <Select value={positionSlot || undefined} onValueChange={setPositionSlot}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose slot" />
                  </SelectTrigger>
                  <SelectContent>
                    {slotOptions.map((slot) => (
                      <SelectItem key={slot.slot} value={slot.slot}>
                        {slot.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {pairDate && (
            <label className="flex items-start gap-2 rounded-md border border-border/80 px-2.5 py-2 text-sm leading-snug">
              <Checkbox
                className="mt-0.5"
                checked={coversWeekendPair}
                onCheckedChange={(checked) => setCoversWeekendPair(checked === true)}
              />
              Needed both weekend services ({[scheduleDate, pairDate].sort().map((date) => formatGapDate(date)).join(" & ")})
            </label>
          )}

          <div className="space-y-3 rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">Who should get this?</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {`People who serve ${positionLabel === "matching" ? "this slot" : positionLabel} on the teams you check. A yes waits for your approval, then they're added for ${pairDate && coversWeekendPair ? "both days" : "that date"}.`}
              </p>
            </div>
            <CheckGrid
              label="Campuses"
              options={allCampuses.map((campus) => ({ value: campus.id, label: campus.name }))}
              selected={targetCampusIds}
              onChange={setTargetCampusIds}
            />
            <CheckGrid
              label="Ministries"
              options={ministryOptions.map((ministry) => ({ value: ministry.value, label: ministry.label }))}
              selected={targetMinistryTypes}
              onChange={setTargetMinistryTypes}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="gap-message">Note (optional)</Label>
            <Textarea
              id="gap-message"
              rows={2}
              placeholder="Call time, service times, anything they should know"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
            />
          </div>

          {candidates !== null && candidates.length === 0 ? (
            <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
              No one is assigned to {positionLabel} on those teams. Check more campuses or ministries, then look again.
            </p>
          ) : null}

          {candidates && candidates.length > 0 ? (
            <div className="space-y-2 rounded-lg border p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">
                  {selectedUserIds.length} of {candidates.length} selected
                </p>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => setSelectedUserIds(candidates.map((candidate) => candidate.id))}
                  >
                    All
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => setSelectedUserIds([])}
                  >
                    None
                  </Button>
                </div>
              </div>
              {candidates.length > 6 && (
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search by name…"
                    className="pl-8"
                  />
                </div>
              )}
              <div className="max-h-56 overflow-y-auto">
                <div className="space-y-1 pr-2">
                  {visibleCandidates.map((candidate) => (
                    <label
                      key={candidate.id}
                      className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted/60"
                    >
                      <Checkbox
                        checked={selectedUserIds.includes(candidate.id)}
                        onCheckedChange={(checked) =>
                          setSelectedUserIds((current) => toggle(current, candidate.id, checked === true))
                        }
                      />
                      <span className="min-w-0 flex-1 truncate text-sm">{candidate.full_name || "Unnamed"}</span>
                      <span className="flex shrink-0 flex-wrap justify-end gap-1">
                        {candidate.campus_names.map((name) => (
                          <Badge key={name} variant="outline" className="text-[10px]">
                            {name}
                          </Badge>
                        ))}
                        {targetMinistryTypes.length > 1 &&
                          candidate.ministry_types.map((ministry) => (
                            <Badge key={ministry} variant="secondary" className="text-[10px]">
                              {getMinistryLabel(ministry)}
                            </Badge>
                          ))}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="shrink-0 space-y-2 border-t px-5 py-3 sm:px-6">
          {previewBlocker && candidates === null ? (
            <p className="text-left text-xs text-muted-foreground">{previewBlocker}</p>
          ) : null}
        <DialogFooter className="flex-row justify-end">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {readyToSend ? (
            <Button type="button" className="gap-2" disabled={send.isPending} onClick={handleSend}>
              {send.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Megaphone className="h-4 w-4" />}
              Send to {selectedUserIds.length}
            </Button>
          ) : (
            <Button
              type="button"
              className="gap-2"
              disabled={!canPreview || preview.isPending}
              onClick={handlePreview}
            >
              {preview.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
              Find volunteers
            </Button>
          )}
        </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
