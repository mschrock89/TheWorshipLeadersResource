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
import {
  type GapCandidate,
  usePreviewGapRecipients,
  useSendGapRequest,
} from "@/hooks/useGapRequests";
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

export interface SendGapRequestDefaults {
  campusId?: string;
  ministryType?: string;
  scheduleDate?: string;
  positionSlot?: string;
}

export function SendGapRequestDialog({
  open,
  onOpenChange,
  defaults,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaults?: SendGapRequestDefaults;
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
  const [candidates, setCandidates] = useState<GapCandidate[] | null>(null);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");

  const myCampuses = useMemo(
    () => userCampuses.map((entry) => entry.campuses).filter(Boolean),
    [userCampuses],
  );
  const gapCampusOptions = isAdmin || myCampuses.length === 0 ? allCampuses : myCampuses;
  const slotOptions = useMemo(() => slotOptionsForMinistry(ministryType), [ministryType]);
  const position = POSITION_SLOTS.find((slot) => slot.slot === positionSlot)?.position || "";
  const pairDate = scheduleDate && isWeekend(scheduleDate) ? getWeekendPairDate(scheduleDate) : null;

  useEffect(() => {
    if (!open) return;
    const initialCampus = defaults?.campusId || myCampuses[0]?.id || "";
    const initialMinistry = defaults?.ministryType || "weekend_team";
    setCampusId(initialCampus);
    setMinistryType(initialMinistry);
    setScheduleDate(defaults?.scheduleDate || "");
    setPositionSlot(defaults?.positionSlot || "");
    setCoversWeekendPair(true);
    setTargetCampusIds(initialCampus ? [initialCampus] : []);
    setTargetMinistryTypes([initialMinistry]);
    setMessage("");
    setCandidates(null);
    setSelectedUserIds([]);
    setSearch("");
    // Only reset when the dialog opens; campus data arriving later shouldn't wipe edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!campusId && myCampuses[0]?.id && open) {
      setCampusId(myCampuses[0].id);
      setTargetCampusIds((current) => (current.length ? current : [myCampuses[0].id]));
    }
  }, [campusId, myCampuses, open]);

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
      const result = await preview.mutateAsync(draft);
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-primary" />
            Send a Gap Request
          </DialogTitle>
          <DialogDescription>
            Push a request to every volunteer in a position. They can answer Yes or No right from the notification.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="gap-date">Date</Label>
              <Input
                id="gap-date"
                type="date"
                min={churchToday()}
                value={scheduleDate}
                onChange={(event) => setScheduleDate(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Campus with the gap</Label>
              <Select value={campusId} onValueChange={handleCampusChange}>
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
            <div className="space-y-1.5">
              <Label>Ministry</Label>
              <Select value={ministryType} onValueChange={handleMinistryChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MINISTRY_OPTIONS.map((ministry) => (
                    <SelectItem key={ministry.value} value={ministry.value}>
                      {ministry.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Open slot</Label>
              <Select value={positionSlot} onValueChange={setPositionSlot}>
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

          {pairDate && (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={coversWeekendPair}
                onCheckedChange={(checked) => setCoversWeekendPair(checked === true)}
              />
              Needed both weekend services ({[scheduleDate, pairDate].sort().map((date) => formatGapDate(date)).join(" & ")})
            </label>
          )}

          <p className="text-xs text-muted-foreground">
            Volunteers who say yes wait for your approval. When you approve one, they're added to this slot on the
            scheduled team's roster for {pairDate && coversWeekendPair ? "both days" : "that date"}.
          </p>

          <div className="space-y-2 rounded-lg border p-3">
            <p className="text-sm font-medium">Who should get this?</p>
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">Campuses</p>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {allCampuses.map((campus) => (
                  <label key={campus.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={targetCampusIds.includes(campus.id)}
                      onCheckedChange={(checked) =>
                        setTargetCampusIds((current) => toggle(current, campus.id, checked === true))
                      }
                    />
                    {campus.name}
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-1.5 pt-1">
              <p className="text-xs text-muted-foreground">Ministries</p>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {MINISTRY_OPTIONS.map((ministry) => (
                  <label key={ministry.value} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={targetMinistryTypes.includes(ministry.value)}
                      onCheckedChange={(checked) =>
                        setTargetMinistryTypes((current) => toggle(current, ministry.value, checked === true))
                      }
                    />
                    {ministry.label}
                  </label>
                ))}
              </div>
            </div>
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

          {candidates === null ? (
            <Button
              type="button"
              variant="secondary"
              className="w-full gap-2"
              disabled={!canPreview || preview.isPending}
              onClick={handlePreview}
            >
              {preview.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
              Find {positionLabel} volunteers
            </Button>
          ) : candidates.length === 0 ? (
            <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
              No one is assigned to {positionLabel} in those campuses and ministries. Try reaching more campuses or ministries.
            </p>
          ) : (
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
                    onClick={() => setSelectedUserIds(candidates.map((candidate) => candidate.id))}
                  >
                    All
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedUserIds([])}>
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
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            className="gap-2"
            disabled={!candidates?.length || selectedUserIds.length === 0 || send.isPending}
            onClick={handleSend}
          >
            {send.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Megaphone className="h-4 w-4" />}
            Send to {selectedUserIds.length}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
