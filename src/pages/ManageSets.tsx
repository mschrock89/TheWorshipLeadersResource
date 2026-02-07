import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { Home, Trash2, Check, Music, Calendar, Building2, Filter, CheckSquare, Square, AlertTriangle, CalendarX } from "lucide-react";
import { CancelServiceDialog } from "@/components/set-planner/CancelServiceDialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useCampuses } from "@/hooks/useCampuses";
import { MINISTRY_TYPES } from "@/lib/constants";

interface DraftSetWithDetails {
  id: string;
  campus_id: string;
  ministry_type: string;
  plan_date: string;
  status: string;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  notes: string | null;
  campus?: { name: string };
  song_count: number;
}

function useAllDraftSets() {
  return useQuery({
    queryKey: ["all-draft-sets"],
    queryFn: async () => {
      const { data: sets, error } = await supabase
        .from("draft_sets")
        .select(`
          *,
          campus:campuses(name)
        `)
        .order("plan_date", { ascending: false });

      if (error) throw error;

      // Get song counts for each set
      const setIds = (sets || []).map(s => s.id);
      const { data: songCounts } = await supabase
        .from("draft_set_songs")
        .select("draft_set_id")
        .in("draft_set_id", setIds);

      const countMap = new Map<string, number>();
      for (const song of songCounts || []) {
        countMap.set(song.draft_set_id, (countMap.get(song.draft_set_id) || 0) + 1);
      }

      return (sets || []).map(s => ({
        ...s,
        song_count: countMap.get(s.id) || 0,
      })) as DraftSetWithDetails[];
    },
  });
}

function useBulkDeleteSets() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (setIds: string[]) => {
      const { error } = await supabase
        .from("draft_sets")
        .delete()
        .in("id", setIds);

      if (error) throw error;
      return setIds.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["all-draft-sets"] });
      queryClient.invalidateQueries({ queryKey: ["draft-sets"] });
      queryClient.invalidateQueries({ queryKey: ["published-setlists"] });
      toast({
        title: "Sets deleted",
        description: `${count} set${count > 1 ? 's' : ''} have been deleted.`,
      });
    },
    onError: (error) => {
      toast({
        title: "Error deleting sets",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export default function ManageSets() {
  const { data: sets = [], isLoading } = useAllDraftSets();
  const { data: campuses = [] } = useCampuses();
  const bulkDelete = useBulkDeleteSets();
  
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [campusFilter, setCampusFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [ministryFilter, setMinistryFilter] = useState<string>("all");
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // Filter sets based on selected filters
  const filteredSets = useMemo(() => {
    return sets.filter(set => {
      if (campusFilter !== "all" && set.campus_id !== campusFilter) return false;
      if (statusFilter !== "all" && set.status !== statusFilter) return false;
      if (ministryFilter !== "all" && set.ministry_type !== ministryFilter) return false;
      return true;
    });
  }, [sets, campusFilter, statusFilter, ministryFilter]);

  // Group sets by date
  const groupedSets = useMemo(() => {
    const groups = new Map<string, DraftSetWithDetails[]>();
    for (const set of filteredSets) {
      const existing = groups.get(set.plan_date) || [];
      existing.push(set);
      groups.set(set.plan_date, existing);
    }
    return Array.from(groups.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [filteredSets]);

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const selectAll = () => {
    if (selectedIds.size === filteredSets.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredSets.map(s => s.id)));
    }
  };

  const selectDraftsOnly = () => {
    setSelectedIds(new Set(filteredSets.filter(s => s.status === "draft").map(s => s.id)));
  };

  const handleBulkDelete = async () => {
    await bulkDelete.mutateAsync(Array.from(selectedIds));
    setSelectedIds(new Set());
    setShowDeleteDialog(false);
  };

  const getMinistryLabel = (type: string) => {
    return MINISTRY_TYPES.find(m => m.value === type)?.label || type;
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="mx-auto max-w-5xl">
        {/* Breadcrumb */}
        <Breadcrumb className="mb-4">
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to="/dashboard" className="flex items-center gap-1.5">
                  <Home className="h-3.5 w-3.5" />
                  Dashboard
                </Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to="/set-planner">Set Planner</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Manage Sets</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Header */}
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Manage Sets</h1>
            <p className="text-sm text-muted-foreground mt-1">
              View and manage all draft and published setlists
            </p>
          </div>
          
          <div className="flex items-center gap-2">
            <CancelServiceDialog />
            
            {selectedIds.size > 0 && (
              <Button
                variant="destructive"
                onClick={() => setShowDeleteDialog(true)}
                className="gap-2"
              >
                <Trash2 className="h-4 w-4" />
                Delete {selectedIds.size} Selected
              </Button>
            )}
          </div>
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Filter className="h-4 w-4" />
              Filters
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              <Select value={campusFilter} onValueChange={setCampusFilter}>
                <SelectTrigger className="w-[160px]">
                  <Building2 className="h-4 w-4 mr-2 text-muted-foreground" />
                  <SelectValue placeholder="Campus" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Campuses</SelectItem>
                  {campuses.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="published">Published</SelectItem>
                </SelectContent>
              </Select>

              <Select value={ministryFilter} onValueChange={setMinistryFilter}>
                <SelectTrigger className="w-[160px]">
                  <Music className="h-4 w-4 mr-2 text-muted-foreground" />
                  <SelectValue placeholder="Ministry" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Ministries</SelectItem>
                  {MINISTRY_TYPES.map(m => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="flex gap-2 ml-auto">
                <Button variant="outline" size="sm" onClick={selectAll}>
                  {selectedIds.size === filteredSets.length ? (
                    <>
                      <Square className="h-4 w-4 mr-1.5" />
                      Deselect All
                    </>
                  ) : (
                    <>
                      <CheckSquare className="h-4 w-4 mr-1.5" />
                      Select All
                    </>
                  )}
                </Button>
                <Button variant="outline" size="sm" onClick={selectDraftsOnly}>
                  Select Drafts Only
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold">{sets.length}</div>
              <div className="text-xs text-muted-foreground">Total Sets</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-green-600">
                {sets.filter(s => s.status === "published").length}
              </div>
              <div className="text-xs text-muted-foreground">Published</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-amber-600">
                {sets.filter(s => s.status === "draft").length}
              </div>
              <div className="text-xs text-muted-foreground">Drafts</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-blue-600">
                {filteredSets.length}
              </div>
              <div className="text-xs text-muted-foreground">Filtered</div>
            </CardContent>
          </Card>
        </div>

        {/* Sets List */}
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-20 bg-muted animate-pulse rounded-lg" />
            ))}
          </div>
        ) : groupedSets.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Music className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No sets found</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {groupedSets.map(([date, dateSets]) => (
              <div key={date}>
                <div className="flex items-center gap-2 mb-3">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <h3 className="font-medium text-foreground">
                    {format(parseISO(date), "EEEE, MMMM d, yyyy")}
                  </h3>
                  <Badge variant="outline" className="ml-2">
                    {dateSets.length} set{dateSets.length > 1 ? 's' : ''}
                  </Badge>
                  {dateSets.length > 1 && (
                    <Badge variant="destructive" className="text-[10px]">
                      Duplicates
                    </Badge>
                  )}
                </div>
                
                <div className="space-y-2">
                  {dateSets.map(set => (
                    <Card 
                      key={set.id} 
                      className={`transition-colors ${selectedIds.has(set.id) ? 'ring-2 ring-primary bg-primary/5' : ''}`}
                    >
                      <CardContent className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <Checkbox
                            checked={selectedIds.has(set.id)}
                            onCheckedChange={() => toggleSelect(set.id)}
                          />
                          
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-sm">
                                {set.campus?.name || "Unknown Campus"}
                              </span>
                              <Badge variant="secondary" className="text-xs">
                                {getMinistryLabel(set.ministry_type)}
                              </Badge>
                              <Badge 
                                variant={set.status === "published" ? "default" : "outline"}
                                className={set.status === "published" ? "bg-green-600" : ""}
                              >
                                {set.status === "published" ? (
                                  <>
                                    <Check className="h-3 w-3 mr-1" />
                                    Published
                                  </>
                                ) : (
                                  "Draft"
                                )}
                              </Badge>
                            </div>
                            <div className="text-xs text-muted-foreground mt-1 flex items-center gap-3">
                              <span>{set.song_count} songs</span>
                              {set.published_at && (
                                <span>
                                  Published {format(parseISO(set.published_at), "MMM d 'at' h:mm a")}
                                </span>
                              )}
                              {!set.published_at && (
                                <span>
                                  Updated {format(parseISO(set.updated_at), "MMM d 'at' h:mm a")}
                                </span>
                              )}
                            </div>
                          </div>

                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => {
                              setSelectedIds(new Set([set.id]));
                              setShowDeleteDialog(true);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                Delete {selectedIds.size} Set{selectedIds.size > 1 ? 's' : ''}?
              </AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. The selected setlists and all their 
                song assignments will be permanently deleted.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleBulkDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {bulkDelete.isPending ? "Deleting..." : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}