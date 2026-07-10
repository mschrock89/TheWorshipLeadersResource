import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus, X } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { useUserRoles } from "@/hooks/useUserRoles";
import { useCampuses } from "@/hooks/useCampuses";
import { leadsMinistry } from "@/lib/hubAccess";
import {
  useAddMinistryMembership,
  useHubProfiles,
  useMinistries,
  useMinistryMemberships,
  useRemoveMinistryMembership,
  type HubProfile,
} from "../hooks";

const ALL = "__all__";

export default function HubDirectory() {
  const { user } = useAuth();
  const { data: roles = [] } = useUserRoles(user?.id);
  const roleNames = roles.map((r) => r.role);

  const { data: profiles = [], isLoading: profilesLoading } = useHubProfiles();
  const { data: memberships = [] } = useMinistryMemberships();
  const { data: ministries = [] } = useMinistries();
  const { data: campuses = [] } = useCampuses();
  const addMembership = useAddMinistryMembership();
  const removeMembership = useRemoveMinistryMembership();

  const [search, setSearch] = useState("");
  const [ministryFilter, setMinistryFilter] = useState(ALL);
  const [campusFilter, setCampusFilter] = useState(ALL);
  const [addTarget, setAddTarget] = useState<HubProfile | null>(null);
  const [addMinistryKey, setAddMinistryKey] = useState("");
  const [addCampusId, setAddCampusId] = useState("");

  const membershipsByUser = useMemo(() => {
    const map = new Map<string, typeof memberships>();
    for (const membership of memberships) {
      const list = map.get(membership.user_id) ?? [];
      list.push(membership);
      map.set(membership.user_id, list);
    }
    return map;
  }, [memberships]);

  const ministryCounts = useMemo(() => {
    const counts = new Map<string, Set<string>>();
    for (const membership of memberships) {
      const set = counts.get(membership.ministry_key) ?? new Set<string>();
      set.add(membership.user_id);
      counts.set(membership.ministry_key, set);
    }
    return counts;
  }, [memberships]);

  const visibleProfiles = useMemo(() => {
    const term = search.trim().toLowerCase();

    return profiles.filter((profile) => {
      const userMemberships = membershipsByUser.get(profile.id) ?? [];

      if (term) {
        const haystack = `${profile.full_name ?? ""} ${profile.email}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }

      if (ministryFilter !== ALL && !userMemberships.some((m) => m.ministry_key === ministryFilter)) {
        return false;
      }

      if (campusFilter !== ALL && !userMemberships.some((m) => m.campus_id === campusFilter)) {
        return false;
      }

      return true;
    });
  }, [profiles, membershipsByUser, search, ministryFilter, campusFilter]);

  const openAddDialog = (profile: HubProfile) => {
    setAddTarget(profile);
    setAddMinistryKey("");
    setAddCampusId("");
  };

  const handleAdd = async () => {
    if (!addTarget || !addMinistryKey || !addCampusId) {
      toast.error("Pick a ministry and campus");
      return;
    }

    try {
      await addMembership.mutateAsync({
        user_id: addTarget.id,
        ministry_key: addMinistryKey,
        campus_id: addCampusId,
      });
      toast.success(`Added ${addTarget.full_name ?? addTarget.email}`);
      setAddTarget(null);
    } catch (error) {
      console.error("Failed to add membership:", error);
      toast.error(error instanceof Error ? error.message : "Failed to add membership");
    }
  };

  const handleRemove = async (membershipId: string, name: string) => {
    try {
      await removeMembership.mutateAsync(membershipId);
      toast.success(`Removed membership for ${name}`);
    } catch (error) {
      console.error("Failed to remove membership:", error);
      toast.error(error instanceof Error ? error.message : "Failed to remove membership");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3">
        {ministries.map((ministry) => (
          <Card key={ministry.key} className="flex-1 basis-40">
            <CardContent className="p-4">
              <p className="text-2xl font-semibold">{ministryCounts.get(ministry.key)?.size ?? 0}</p>
              <p className="text-sm text-muted-foreground">{ministry.name}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Input
          className="max-w-xs"
          placeholder="Search name or email"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select value={ministryFilter} onValueChange={setMinistryFilter}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All ministries</SelectItem>
            {ministries.map((ministry) => (
              <SelectItem key={ministry.key} value={ministry.key}>
                {ministry.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={campusFilter} onValueChange={setCampusFilter}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All campuses</SelectItem>
            {campuses.map((campus) => (
              <SelectItem key={campus.id} value={campus.id}>
                {campus.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="ml-auto text-sm text-muted-foreground">
          {visibleProfiles.length} of {profiles.length} people
        </span>
      </div>

      {profilesLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <div className="divide-y rounded-lg border">
          {visibleProfiles.map((profile) => {
            const userMemberships = membershipsByUser.get(profile.id) ?? [];
            const displayName = profile.full_name ?? profile.email;

            return (
              <div key={profile.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <Avatar className="h-9 w-9">
                  <AvatarImage src={profile.avatar_url ?? undefined} />
                  <AvatarFallback>{displayName.slice(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="min-w-40">
                  <p className="text-sm font-medium">{displayName}</p>
                  <p className="text-xs text-muted-foreground">{profile.email}</p>
                </div>
                <div className="flex flex-1 flex-wrap items-center gap-1.5">
                  {userMemberships.map((membership) => {
                    const canManage = leadsMinistry(roleNames, membership.ministry_key);
                    return (
                      <Badge key={membership.id} variant="secondary" className="gap-1 pr-1">
                        {membership.ministries?.name ?? membership.ministry_key}
                        <span className="text-muted-foreground">· {membership.campuses?.name ?? "?"}</span>
                        {canManage && (
                          <button
                            type="button"
                            aria-label="Remove membership"
                            className="ml-0.5 rounded-full p-0.5 hover:bg-muted"
                            onClick={() => handleRemove(membership.id, displayName)}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </Badge>
                    );
                  })}
                  {userMemberships.length === 0 && (
                    <span className="text-xs text-muted-foreground">No ministry memberships</span>
                  )}
                </div>
                <Button variant="outline" size="sm" onClick={() => openAddDialog(profile)}>
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Add
                </Button>
              </div>
            );
          })}
          {visibleProfiles.length === 0 && (
            <p className="px-4 py-12 text-center text-sm text-muted-foreground">No people match the filters.</p>
          )}
        </div>
      )}

      <Dialog open={!!addTarget} onOpenChange={(open) => !open && setAddTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add {addTarget?.full_name ?? addTarget?.email} to a ministry</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Ministry</Label>
              <Select value={addMinistryKey} onValueChange={setAddMinistryKey}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose ministry" />
                </SelectTrigger>
                <SelectContent>
                  {ministries
                    .filter((ministry) => leadsMinistry(roleNames, ministry.key))
                    .map((ministry) => (
                      <SelectItem key={ministry.key} value={ministry.key}>
                        {ministry.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Campus</Label>
              <Select value={addCampusId} onValueChange={setAddCampusId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose campus" />
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddTarget(null)}>
              Cancel
            </Button>
            <Button onClick={handleAdd} disabled={addMembership.isPending}>
              {addMembership.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add membership
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
