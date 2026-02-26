import { useState, useMemo, useEffect } from "react";
import { ArrowUp, ArrowDown } from "lucide-react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Music, 
  Search, 
  Calendar,
  TrendingUp,
  Sparkles,
  ChevronRight,
  Loader2,
  MapPin,
  ListMusic,
  Trash2,
  RotateCcw,
  Home,
  Plus,
  GitMerge,
} from "lucide-react";
import { useSongsWithStats, useServicePlans, useServicePlansPaged, usePlanSongs, useAllSyncProgress, useDeleteSong, useCreateSong, useMergeSongs } from "@/hooks/useSongs";
import { AddSongDialog } from "@/components/songs/AddSongDialog";
import { BpmImportDialog } from "@/components/songs/BpmImportDialog";
import { EditableBpmCell } from "@/components/songs/EditableBpmCell";
import { MergeSongDialog } from "@/components/songs/MergeSongDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Progress } from "@/components/ui/progress";
import { usePcoConnection, useAnyPcoConnection } from "@/hooks/usePlanningCenter";
import { useCampuses, useUserCampuses } from "@/hooks/useCampuses";
import { useUserRole } from "@/hooks/useUserRoles";
import { useAuth } from "@/hooks/useAuth";
import { format, parseISO, isAfter, isBefore } from "date-fns";
import { cn } from "@/lib/utils";

export default function Songs() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPlan, setSelectedPlan] = useState<{ id: string; pco_plan_id: string } | null>(null);
  const [selectedCampusId, setSelectedCampusId] = useState<string>("all");
  const [selectedMinistry, setSelectedMinistry] = useState<string>("weekend");
  const [activeListView, setActiveListView] = useState<"all" | "rotation" | "mostUsed" | "newSongs" | "adventSongs">("all");
  const [historySortOrder, setHistorySortOrder] = useState<"newest" | "oldest">("newest");
  const [historyPage, setHistoryPage] = useState(1);
  const PLANS_PER_PAGE = 20;

  // Scroll to top on mount
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);
  
  const { user } = useAuth();
  const { data: connection, isLoading: connectionLoading } = usePcoConnection();
  const { data: hasAnyPcoConnection, isLoading: anyConnectionLoading } = useAnyPcoConnection();
  const { data: songs, isLoading: songsLoading } = useSongsWithStats();
  const hasSongs = (songs?.length ?? 0) > 0;
  
  // Check if we're still loading initial data needed to decide what to show
  const isInitialLoading = songsLoading || connectionLoading || anyConnectionLoading;
  const { data: upcomingPlans, isLoading: plansLoading } = useServicePlans({ upcoming: true });
  const {
    data: historyPlansResponse,
    isLoading: historyPlansLoading,
  } = useServicePlansPaged({
    page: historyPage,
    pageSize: PLANS_PER_PAGE,
    sortOrder: historySortOrder,
    campusId: selectedCampusId === "all" ? undefined : selectedCampusId,
    ministry: selectedMinistry as any,
  });
  const { data: planSongs, isLoading: planSongsLoading } = usePlanSongs(selectedPlan?.id ?? null, selectedPlan?.pco_plan_id);
  const { data: campuses } = useCampuses();
  const { data: userCampuses } = useUserCampuses(user?.id);
  const { data: userRole } = useUserRole(user?.id);
  const { data: allSyncProgress } = useAllSyncProgress();
  const deleteSong = useDeleteSong();
  const mergeSongs = useMergeSongs();
  const [mergeSourceSong, setMergeSourceSong] = useState<{ id: string; title: string } | null>(null);
  const newSongsCutoffDate = useMemo(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 1);
    return d;
  }, []);

  // Permission checks - leaders/admins can sync, only org admins can delete
  const leaderRoles = ['admin', 'campus_admin', 'campus_worship_pastor', 'student_worship_pastor'];
  const canManageSongs = leaderRoles.includes(userRole || '');
  const canDeleteSongs = userRole === 'admin'; // Only organization admins can delete
  
  // Find any in-progress syncs
  const inProgressSyncs = allSyncProgress?.filter(p => p.status === 'in_progress') || [];

  const today = new Date();
  const isAdventSeason = today.getMonth() === 11 && today.getDate() <= 25;
  const isAdventWeekendDate = (isoDate: string) => {
    const parsed = new Date(`${isoDate}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return false;

    const year = parsed.getFullYear();
    const christmas = new Date(year, 11, 25);
    const saturdayBeforeChristmas = new Date(christmas);
    saturdayBeforeChristmas.setDate(saturdayBeforeChristmas.getDate() - 1);
    while (saturdayBeforeChristmas.getDay() !== 6) {
      saturdayBeforeChristmas.setDate(saturdayBeforeChristmas.getDate() - 1);
    }
    const sundayOfAdventWeekend = new Date(saturdayBeforeChristmas);
    sundayOfAdventWeekend.setDate(sundayOfAdventWeekend.getDate() + 1);

    const dateKey = format(parsed, "yyyy-MM-dd");
    return (
      dateKey === format(saturdayBeforeChristmas, "yyyy-MM-dd") ||
      dateKey === format(sundayOfAdventWeekend, "yyyy-MM-dd")
    );
  };
  
  // Determine if user is restricted to their campus only (volunteers/members)
  const isVolunteer = userRole === "volunteer" || userRole === "member";
  const userCampusIds = userCampuses?.map(uc => uc.campus_id) || [];
  
  // Ministry options with their service type patterns
  const ministryOptions = [
    { id: "all", name: "All Ministries" },
    { id: "weekend", name: "Weekend", matchesCampusName: true },
    { id: "encounter", name: "Encounter", serviceTypePatterns: ["Encounter (Boro)", "Encounter (CC)", "Encounter (Tullahoma)", "Encounter"] },
    { id: "eon", name: "EON", serviceTypePatterns: ["EON Boro", "EON Tullahoma", "EON Shelbyville", "EON"] },
    { id: "evident", name: "Evident", serviceTypePatterns: ["Evident", "ER"] },
  ];

  // Available campuses for the dropdown
  const availableCampuses = useMemo(() => {
    if (isVolunteer && userCampusIds.length > 0) {
      return campuses?.filter(c => userCampusIds.includes(c.id)) || [];
    }
    return campuses || [];
  }, [campuses, isVolunteer, userCampusIds]);

  // Set default campus for volunteers
  useEffect(() => {
    if (isVolunteer && userCampusIds.length > 0 && selectedCampusId === "all") {
      setSelectedCampusId(userCampusIds[0]);
    }
  }, [isVolunteer, userCampusIds, selectedCampusId]);

  // Reset page when filters change
  useEffect(() => {
    setHistoryPage(1);
  }, [selectedCampusId, selectedMinistry, historySortOrder]);

  // Get the selected ministry config
  const selectedMinistryConfig = ministryOptions.find(m => m.id === selectedMinistry);

  // Helper to check if a plan matches the selected ministry
  const planMatchesMinistry = (plan: { service_type_name: string; campus_id: string | null }) => {
    // Always exclude Practice Songs plans
    if (plan.service_type_name.toLowerCase().includes('practice song')) {
      return false;
    }

    // "All ministries" means we only apply the Practice Songs exclusion above.
    if (selectedMinistry === "all") return true;
    
    if (!selectedMinistryConfig) return true;
    
    if (selectedMinistryConfig.matchesCampusName) {
      // Weekend ministry: exclude student ministry service types
      const studentServiceTypes = [
        "EON Boro", "EON", "EON Tullahoma", "EON Shelbyville",
        "Encounter (Boro)", "Encounter", "Encounter (CC)", "Encounter (Tullahoma)",
        "Evident", "ER"
      ];
      return !studentServiceTypes.includes(plan.service_type_name);
    }
    
    // Match by service type patterns
    return selectedMinistryConfig.serviceTypePatterns?.some(
      pattern => plan.service_type_name.includes(pattern)
    ) ?? false;
  };

  // Filter plans by campus AND ministry
  const filteredUpcomingPlans = useMemo(() => {
    return upcomingPlans?.filter(p => {
      const matchesCampus = selectedCampusId === "all" || p.campus_id === selectedCampusId;
      const matchesMinistry = planMatchesMinistry(p);
      return matchesCampus && matchesMinistry;
    });
  }, [upcomingPlans, selectedCampusId, selectedMinistry, selectedMinistryConfig]);

  const historyPlans = historyPlansResponse?.plans ?? [];
  const historyTotal = historyPlansResponse?.total ?? 0;
  const historyTotalPages = Math.max(1, Math.ceil(historyTotal / PLANS_PER_PAGE));
  
  // Helper to check if a usage matches the selected filters
  const usageMatchesFilters = (usage: { campus_id: string | null; service_type_name: string }) => {
    const matchesCampus = selectedCampusId === "all" || usage.campus_id === selectedCampusId;

    if (selectedMinistry === "all") return matchesCampus;
    
    if (!selectedMinistryConfig) return matchesCampus;
    
    if (selectedMinistryConfig.matchesCampusName) {
      const studentServiceTypes = [
        "EON Boro", "EON", "EON Tullahoma", "EON Shelbyville",
        "Encounter (Boro)", "Encounter", "Encounter (CC)", "Encounter (Tullahoma)",
        "Evident", "ER"
      ];
      return matchesCampus && !studentServiceTypes.includes(usage.service_type_name);
    }
    
    const matchesMinistry = selectedMinistryConfig.serviceTypePatterns?.some(
      pattern => usage.service_type_name.includes(pattern)
    ) ?? false;
    return matchesCampus && matchesMinistry;
  };

  // Calculate campus-filtered stats and per-song filtered counts
  const { campusFilteredStats, songCampusUsage, regularRotationSongs, newSongsList, adventSongsList, mostUsedTop10 } = useMemo(() => {
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const oneYearAgoStr = oneYearAgo.toISOString().split('T')[0];
    const todayStr = new Date().toISOString().split('T')[0];

    // Build a map of song_id -> campus-filtered usage count (ALL TIME for display, last 52 weeks for rotation stats)
    const usageMap = new Map<string, { count: number; lastUsed: string | null; upcomingCount: number; lastScheduled: string | null }>();

    // Filter each song's usages by campus and ministry
    const songsWithCampusStats = songs?.map(song => {
      const filteredUsages = song.usages?.filter(usageMatchesFilters) || [];

      const pastUsages = filteredUsages.filter(u => u.plan_date < todayStr);
      const upcomingUsages = filteredUsages.filter(u => u.plan_date >= todayStr);
      const scheduledUsages = filteredUsages;
      // Last 52 weeks for rotation stats
      const lastYearUsages = pastUsages.filter(u => u.plan_date >= oneYearAgoStr);
      
      // All-time sorted dates for table display
      const allTimeSortedDates = pastUsages.map(u => u.plan_date).sort();
      const lastUsedAllTime = allTimeSortedDates[allTimeSortedDates.length - 1] || null;
      const firstUsedEver = allTimeSortedDates[0] || null;
      const allScheduledSortedDates = scheduledUsages.map(u => u.plan_date).sort();
      const lastScheduledAt = allScheduledSortedDates[allScheduledSortedDates.length - 1] || null;
      const hasAdventWeekendUsage = scheduledUsages.some((u) => isAdventWeekendDate(u.plan_date));

      // Store in map for table display - use ALL TIME count and last used
      usageMap.set(song.id, {
        count: pastUsages.length,  // All-time count
        lastUsed: lastUsedAllTime, // All-time last used
        upcomingCount: upcomingUsages.length,
        lastScheduled: lastScheduledAt,
      });

      return {
        ...song,
        usagesInLastYear: lastYearUsages.length,
        usagesAllTime: pastUsages.length,
        scheduledCount: scheduledUsages.length,
        lastScheduledAt,
        hasAdventWeekendUsage,
        lastUsedAllTime: lastUsedAllTime,
        firstUsedEver: firstUsedEver,
      };
    }) || [];

    // Most used songs ALL TIME (by campus/ministry filter) - top 10
    const sortedByUsage = [...songsWithCampusStats]
      .filter(song => song.usagesAllTime > 0)
      .sort((a, b) => b.usagesAllTime - a.usagesAllTime);
    const top10 = sortedByUsage.slice(0, 10);

    // New songs: scheduled 1-3 times at this campus/ministry
    const candidateNewSongs = songsWithCampusStats.filter(song => {
      const scheduledCount = song.scheduledCount ?? 0;
      const lastScheduledAt = song.lastScheduledAt ? new Date(song.lastScheduledAt) : null;
      return scheduledCount > 0 &&
             scheduledCount < 4 &&
             !!lastScheduledAt &&
             lastScheduledAt >= oneYearAgo;
    });

    const adventSongs = candidateNewSongs
      .filter((song) => song.hasAdventWeekendUsage)
      .sort((a, b) => (b.scheduledCount ?? 0) - (a.scheduledCount ?? 0));

    // Always keep Advent-weekend songs out of "New Songs".
    // The dedicated Advent list is shown only during Advent season in the UI.
    const newSongs = candidateNewSongs.filter((song) => {
      return !song.hasAdventWeekendUsage;
    }).sort((a, b) => {
      const aDate = a.lastScheduledAt || "";
      const bDate = b.lastScheduledAt || "";
      if (bDate !== aDate) return bDate.localeCompare(aDate);
      return (b.scheduledCount ?? 0) - (a.scheduledCount ?? 0);
    });

    // Regular rotation: 4+ scheduled times at this campus/ministry
    const regularRotation = songsWithCampusStats
      .filter(song => (song.scheduledCount ?? 0) >= 4)
      .sort((a, b) => (b.scheduledCount ?? 0) - (a.scheduledCount ?? 0));

    return {
      campusFilteredStats: {
        mostUsedTitle: top10[0]?.title || "—",
        newSongsCount: newSongs.length,
        adventSongsCount: adventSongs.length,
        regularRotationCount: regularRotation.length,
      },
      songCampusUsage: usageMap,
      regularRotationSongs: regularRotation,
      newSongsList: newSongs,
      adventSongsList: adventSongs,
      mostUsedTop10: top10,
    };
  }, [songs, selectedCampusId, selectedMinistry, selectedMinistryConfig, isAdventSeason]);

  // Get songs and info for current list view
  const getListViewInfo = () => {
    switch (activeListView) {
      case "rotation":
        return { title: "Regular Rotation", subtitle: "Songs scheduled 4+ times for this campus/ministry", songs: regularRotationSongs };
      case "mostUsed":
        return { title: "Most Used Songs", subtitle: "Top 10 most played songs", songs: mostUsedTop10 };
      case "newSongs":
        return { title: "New Songs", subtitle: "Songs scheduled 1-3 times for this campus/ministry", songs: newSongsList };
      case "adventSongs":
        return { title: "Advent Songs", subtitle: "Songs scheduled for Advent weekend", songs: adventSongsList };
      default:
        return null;
    }
  };

  useEffect(() => {
    if (!isAdventSeason && activeListView === "adventSongs") {
      setActiveListView("all");
    }
  }, [isAdventSeason, activeListView]);

  const filteredSongs = songs?.filter(song =>
    song.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    song.author?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const sortedByFrequency = [...(filteredSongs || [])].sort((a, b) => b.usage_count - a.usage_count);
  const sortedByRecent = [...(filteredSongs || [])].sort((a, b) => {
    if (!a.last_used && !b.last_used) return 0;
    if (!a.last_used) return 1;
    if (!b.last_used) return -1;
    return new Date(b.last_used).getTime() - new Date(a.last_used).getTime();
  });

  // Show loading state while we determine what view to show
  if (isInitialLoading) {
    return (
      <>
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6">
          <Loader2 className="h-12 w-12 text-primary animate-spin mb-4" />
          <p className="text-muted-foreground">Loading song library...</p>
          <div className="w-48 mt-4 h-2 bg-secondary rounded-full overflow-hidden">
            <div className="h-full bg-primary animate-pulse" style={{ width: '100%' }} />
          </div>
        </div>
      </>
    );
  }

  // Show connect PCO message only if no songs exist AND no one has connected yet AND user is not a volunteer
  // Volunteers should see songs if they exist, or a friendly message if not
  if (!connection && !hasSongs && !hasAnyPcoConnection && !isVolunteer) {
    return (
      <>
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6">
          <Music className="h-16 w-16 text-muted-foreground mb-4" />
          <h2 className="text-2xl font-semibold mb-2">Connect Planning Center</h2>
          <p className="text-muted-foreground mb-6 max-w-md">
            Connect your Planning Center account to sync service plans and track song usage.
          </p>
          <Link to="/settings/planning-center">
            <Button>
              Connect Planning Center
              <ChevronRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </div>
      </>
    );
  }

  // Volunteers see a message if no songs have been synced yet
  if (!hasSongs && isVolunteer) {
    return (
      <>
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6">
          <Music className="h-16 w-16 text-muted-foreground mb-4" />
          <h2 className="text-2xl font-semibold mb-2">Song Library</h2>
          <p className="text-muted-foreground mb-6 max-w-md">
            The song library hasn't been set up yet. Check back later!
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="space-y-6">
        {/* Breadcrumb Navigation */}
        <Breadcrumb>
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
              <BreadcrumbPage>Songs</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Header */}
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <h1 className="font-display text-3xl font-bold text-foreground md:text-4xl">
              Songs
            </h1>
            <p className="text-muted-foreground">
              Track song usage and upcoming plans
            </p>
          </div>
          {canManageSongs && (
            <div className="flex gap-2 shrink-0 flex-wrap">
              <AddSongDialog 
                trigger={
                  <Button 
                    size="lg" 
                    className="gap-3 px-8 py-6 text-base font-semibold bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-400 text-black shadow-[0_0_20px_rgba(234,179,8,0.4)] hover:shadow-[0_0_30px_rgba(234,179,8,0.6)] transition-all duration-300 hover:scale-[1.03] border-0"
                  >
                    <Plus className="h-5 w-5" />
                    New Song
                  </Button>
                }
              />
              <Link to="/set-planner">
                <Button 
                  size="lg" 
                  variant="outline"
                  className="gap-3 px-8 py-6 text-base font-semibold"
                >
                  <ListMusic className="h-5 w-5" />
                  Set Builder
                </Button>
              </Link>
              <BpmImportDialog />
            </div>
          )}
        </div>

        {/* Merge Song Dialog */}
        {mergeSourceSong && (
          <MergeSongDialog
            open={!!mergeSourceSong}
            onOpenChange={(open) => !open && setMergeSourceSong(null)}
            sourceSong={mergeSourceSong}
            onMerge={(targetSongId) => {
              mergeSongs.mutate(
                { sourceSongId: mergeSourceSong.id, targetSongId },
                {
                  onSuccess: () => setMergeSourceSong(null),
                }
              );
            }}
            isMerging={mergeSongs.isPending}
          />
        )}

        {/* In-Progress Sync Status */}
        {inProgressSyncs.length > 0 && (
          <Card className="border-primary/50 bg-primary/5">
            <CardContent className="p-4">
              <div className="space-y-3">
                {inProgressSyncs.map((progress) => {
                  // Calculate percentage: service type progress + fractional plan progress
                  // Each service type is worth equal weight (1/total_service_types)
                  const serviceTypeWeight = progress.total_service_types 
                    ? 100 / progress.total_service_types 
                    : 0;
                  const basePercentage = progress.current_service_type_index * serviceTypeWeight;
                  // Add fractional progress within current service type based on plans processed
                  // Estimate ~50 plans per service type for fractional progress
                  const planFraction = Math.min(progress.current_plan_index / 50, 1) * serviceTypeWeight;
                  const percentage = Math.min(Math.round(basePercentage + planFraction), 100);
                  
                  return (
                    <div key={progress.id} className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                        <span className="font-medium">
                          Syncing {progress.start_year}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {progress.total_plans_processed} plans • {progress.total_songs_processed} songs
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <Progress value={percentage} className="flex-1 h-2" />
                        <span className="text-sm font-medium text-foreground w-12 text-right">
                          {percentage}%
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Ministry {progress.current_service_type_index + 1} of {progress.total_service_types || '?'}
                        {progress.current_plan_index > 0 && ` • Plan ${progress.current_plan_index}`}
                      </p>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-4">
          {/* Campus Filter */}
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-muted-foreground" />
            <Select value={selectedCampusId} onValueChange={setSelectedCampusId}>
              <SelectTrigger className="w-[180px] bg-background">
                <SelectValue placeholder="Select campus" />
              </SelectTrigger>
              <SelectContent className="bg-popover">
                {!isVolunteer && <SelectItem value="all">All Campuses</SelectItem>}
                {availableCampuses.map((campus) => (
                  <SelectItem key={campus.id} value={campus.id}>
                    {campus.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Ministry Filter */}
          <div className="flex items-center gap-2">
            <Music className="h-4 w-4 text-muted-foreground" />
            <Select value={selectedMinistry} onValueChange={setSelectedMinistry}>
              <SelectTrigger className="w-[160px] bg-background">
                <SelectValue placeholder="Select ministry" />
              </SelectTrigger>
              <SelectContent className="bg-popover">
                {ministryOptions.map((ministry) => (
                  <SelectItem key={ministry.id} value={ministry.id}>
                    {ministry.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Stats Cards - Hidden for volunteers */}
        {!isVolunteer && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
            <Card className="bg-card/50">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Music className="h-4 w-4" />
                  <span className="text-xs font-medium uppercase tracking-wider">Total Songs</span>
                </div>
                <p className="mt-2 text-2xl font-bold">{songs?.length || 0}</p>
              </CardContent>
            </Card>
            <Card className="bg-card/50">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <RotateCcw className="h-4 w-4" />
                  <span className="text-xs font-medium uppercase tracking-wider">Regular Rotation</span>
                </div>
                <p className="mt-2 text-2xl font-bold">{campusFilteredStats.regularRotationCount}</p>
              </CardContent>
            </Card>
            <Card className="bg-card/50">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <TrendingUp className="h-4 w-4" />
                  <span className="text-xs font-medium uppercase tracking-wider">Most Used</span>
                </div>
                <p className="mt-2 text-base font-semibold leading-tight">
                  {campusFilteredStats.mostUsedTitle}
                </p>
              </CardContent>
            </Card>
            <Card className="bg-card/50">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Sparkles className="h-4 w-4" />
                  <span className="text-xs font-medium uppercase tracking-wider">New Songs</span>
                </div>
                <p className="mt-2 text-2xl font-bold">
                  {campusFilteredStats.newSongsCount}
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Main Content */}
        <Tabs defaultValue="library" className="space-y-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <TabsList className="bg-muted/50 p-1">
              <TabsTrigger value="library" className="sm:px-4" onClick={() => { setActiveListView("all"); setSearchQuery(""); }}>
                Song Library
              </TabsTrigger>
              {!isVolunteer && (
                <>
                  <TabsTrigger value="upcoming" className="sm:px-4">
                    Upcoming Plans
                  </TabsTrigger>
                  <TabsTrigger value="history" className="sm:px-4">
                    Plan History
                  </TabsTrigger>
                </>
              )}
            </TabsList>
            
            {!isVolunteer && (
              <div className="flex items-center gap-2">
                <Button
                  variant={activeListView === "rotation" ? "default" : "outline"}
                  size="sm"
                  onClick={() => { setActiveListView(activeListView === "rotation" ? "all" : "rotation"); setSearchQuery(""); }}
                  className="gap-1.5"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <Badge variant={activeListView === "rotation" ? "outline" : "secondary"}>{campusFilteredStats.regularRotationCount}</Badge>
                </Button>
                <Button
                  variant={activeListView === "mostUsed" ? "default" : "outline"}
                  size="sm"
                  onClick={() => { setActiveListView(activeListView === "mostUsed" ? "all" : "mostUsed"); setSearchQuery(""); }}
                  className="gap-1.5"
                >
                  <TrendingUp className="h-3.5 w-3.5" />
                  <Badge variant={activeListView === "mostUsed" ? "outline" : "secondary"}>10</Badge>
                </Button>
                <Button
                  variant={activeListView === "newSongs" ? "default" : "outline"}
                  size="sm"
                  onClick={() => { setActiveListView(activeListView === "newSongs" ? "all" : "newSongs"); setSearchQuery(""); }}
                  className="gap-1.5"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  <Badge variant={activeListView === "newSongs" ? "outline" : "secondary"}>{campusFilteredStats.newSongsCount}</Badge>
                </Button>
                {isAdventSeason && (
                  <Button
                    variant={activeListView === "adventSongs" ? "default" : "outline"}
                    size="sm"
                    onClick={() => { setActiveListView(activeListView === "adventSongs" ? "all" : "adventSongs"); setSearchQuery(""); }}
                    className="gap-1.5"
                  >
                    <Calendar className="h-3.5 w-3.5" />
                    <Badge variant={activeListView === "adventSongs" ? "outline" : "secondary"}>{campusFilteredStats.adventSongsCount}</Badge>
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* Song Library Tab */}
          <TabsContent value="library" className="space-y-4">
            {activeListView !== "all" && getListViewInfo() ? (
              // Show filtered list view
              <>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search within list..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 bg-background/50"
                  />
                </div>
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-lg">{getListViewInfo()?.title}</CardTitle>
                        <p className="text-sm text-muted-foreground mt-1">{getListViewInfo()?.subtitle}</p>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => { setActiveListView("all"); setSearchQuery(""); }}>
                        Show All Songs
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    {(() => {
                      const listSongs = getListViewInfo()?.songs || [];
                      const filteredListSongs = listSongs.filter(song =>
                        song.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        (song.author && song.author.toLowerCase().includes(searchQuery.toLowerCase()))
                      );
                      
                      if (filteredListSongs.length === 0) {
                        return <p className="text-center text-muted-foreground py-8">No songs match this criteria</p>;
                      }
                      
                      return (
                        <div className="divide-y">
                          {filteredListSongs.map((song, index) => {
                            const usage = songCampusUsage.get(song.id);
                            return (
                              <div 
                                key={song.id}
                                className="flex items-center justify-between py-3 px-4 hover:bg-muted/50"
                              >
                                <div className="flex items-center gap-3 min-w-0">
                                  {activeListView === "mostUsed" && (
                                    <span className="text-lg font-bold text-muted-foreground w-6">
                                      {index + 1}
                                    </span>
                                  )}
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                      <p className="font-medium truncate">{song.title}</p>
                                      {(() => {
                                        const scheduledCount = (song as any).scheduledCount ?? 0;
                                        const lastScheduledAt = (song as any).lastScheduledAt ? new Date((song as any).lastScheduledAt) : null;
                                        const isNew =
                                          scheduledCount > 0 &&
                                          scheduledCount < 4 &&
                                          !!lastScheduledAt &&
                                          lastScheduledAt >= newSongsCutoffDate;
                                        return isNew ? (
                                          <Badge variant="outline" className="text-xs h-5 px-2 shrink-0 border-[#35B0E5]/50 text-[#35B0E5] bg-[#35B0E5]/10">
                                            NEW
                                          </Badge>
                                        ) : null;
                                      })()}
                                    </div>
                                    <p className="text-sm text-muted-foreground truncate">
                                      {song.author || "Unknown"}
                                    </p>
                                  </div>
                                </div>
                                <Badge variant="secondary" className="ml-2 shrink-0">
                                  {activeListView === "mostUsed" ? song.usagesAllTime : (usage?.count ?? 0)}
                                </Badge>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </CardContent>
                </Card>
              </>
            ) : (
              // Show full song library
              <>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search songs by title or author..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 bg-background/50"
                  />
                </div>

                <Card>
                  <CardContent className="p-0">
                    {songsLoading ? (
                    <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Title</TableHead>
                            <TableHead className="hidden md:table-cell">Author</TableHead>
                            <TableHead className="text-center">Times Used</TableHead>
                            <TableHead className="hidden sm:table-cell">Last Used</TableHead>
                            <TableHead className="text-center">Upcoming</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {[...Array(8)].map((_, i) => (
                            <TableRow key={i}>
                              <TableCell>
                                <div className="space-y-2">
                                  <Skeleton className="h-4 w-40" />
                                  <Skeleton className="h-3 w-24 md:hidden" />
                                </div>
                              </TableCell>
                              <TableCell className="hidden md:table-cell">
                                <Skeleton className="h-4 w-28" />
                              </TableCell>
                              <TableCell className="text-center">
                                <Skeleton className="h-5 w-8 mx-auto rounded-full" />
                              </TableCell>
                              <TableCell className="hidden sm:table-cell">
                                <Skeleton className="h-4 w-20" />
                              </TableCell>
                              <TableCell className="text-center">
                                <Skeleton className="h-5 w-6 mx-auto rounded-full" />
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    ) : filteredSongs?.length === 0 ? (
                      <div className="p-8 text-center text-muted-foreground">
                        <Music className="h-12 w-12 mx-auto mb-3 opacity-50" />
                        <p>No songs found. Sync from Planning Center to get started.</p>
                      </div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Title</TableHead>
                            <TableHead className="hidden md:table-cell">Author</TableHead>
                            <TableHead className="text-center hidden sm:table-cell">BPM</TableHead>
                            <TableHead className="text-center">Times Used</TableHead>
                            <TableHead className="hidden sm:table-cell">Last Used</TableHead>
                            <TableHead className="text-center">Upcoming</TableHead>
                            {canManageSongs && <TableHead className="w-20"></TableHead>}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredSongs?.map((song) => (
                            <TableRow key={song.id}>
                              <TableCell className="font-medium">
                                <div className="flex items-center gap-2">
                                  <span>{song.title}</span>
                                  {(() => {
                                    const usage = songCampusUsage.get(song.id);
                                    const scheduledCount = (usage?.count ?? 0) + (usage?.upcomingCount ?? 0);
                                    const lastScheduledAt = usage?.lastScheduled ? new Date(usage.lastScheduled) : null;
                                    const isNew =
                                      scheduledCount > 0 &&
                                      scheduledCount < 4 &&
                                      !!lastScheduledAt &&
                                      lastScheduledAt >= newSongsCutoffDate;
                                    return isNew ? (
                                      <Badge variant="outline" className="text-xs h-5 px-2 border-[#35B0E5]/50 text-[#35B0E5] bg-[#35B0E5]/10">
                                        NEW
                                      </Badge>
                                    ) : null;
                                  })()}
                                </div>
                                <div className="text-sm text-muted-foreground md:hidden">
                                  {song.author || "Unknown"}
                                </div>
                              </TableCell>
                              <TableCell className="hidden md:table-cell text-muted-foreground">
                                {song.author || "Unknown"}
                              </TableCell>
                              <TableCell className="text-center hidden sm:table-cell">
                                <EditableBpmCell
                                  songId={song.id}
                                  currentBpm={song.bpm}
                                  canEdit={canManageSongs}
                                />
                              </TableCell>
                              <TableCell className="text-center">
                                {(() => {
                                  const usage = songCampusUsage.get(song.id);
                                  const count = usage?.count ?? 0;
                                  return (
                                    <Badge variant={count > 5 ? "default" : "secondary"}>
                                      {count}
                                    </Badge>
                                  );
                                })()}
                              </TableCell>
                              <TableCell className="hidden sm:table-cell text-muted-foreground">
                                {(() => {
                                  const usage = songCampusUsage.get(song.id);
                                  return usage?.lastUsed
                                    ? format(parseISO(usage.lastUsed), "MMM d, yyyy")
                                    : "Never";
                                })()}
                              </TableCell>
                              <TableCell className="text-center">
                                {(() => {
                                  const usage = songCampusUsage.get(song.id);
                                  const upcoming = usage?.upcomingCount ?? 0;
                                  return upcoming > 0 ? (
                                    <Badge variant="outline" className="bg-primary/10">
                                      {upcoming}
                                    </Badge>
                                  ) : (
                                    <span className="text-muted-foreground">—</span>
                                  );
                                })()}
                              </TableCell>
                              {canManageSongs && (
                                <TableCell>
                                  <div className="flex items-center gap-1">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-muted-foreground hover:text-primary"
                                      onClick={() => setMergeSourceSong({ id: song.id, title: song.title })}
                                      title="Merge into another song"
                                    >
                                      <GitMerge className="h-4 w-4" />
                                    </Button>
                                    {canDeleteSongs && (
                                      <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                          >
                                            <Trash2 className="h-4 w-4" />
                                          </Button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent>
                                          <AlertDialogHeader>
                                            <AlertDialogTitle>Delete song?</AlertDialogTitle>
                                            <AlertDialogDescription>
                                              This will permanently delete "{song.title}" from your library,
                                              including all usage history. This action cannot be undone.
                                            </AlertDialogDescription>
                                          </AlertDialogHeader>
                                          <AlertDialogFooter>
                                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                                            <AlertDialogAction
                                              onClick={() => deleteSong.mutate(song.id)}
                                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                            >
                                              Delete
                                            </AlertDialogAction>
                                          </AlertDialogFooter>
                                        </AlertDialogContent>
                                      </AlertDialog>
                                    )}
                                  </div>
                                </TableCell>
                              )}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          {/* Upcoming Plans Tab */}
          <TabsContent value="upcoming" className="space-y-4">
            {plansLoading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-24 w-full" />
                ))}
              </div>
            ) : filteredUpcomingPlans?.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center text-muted-foreground">
                  <Calendar className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No upcoming plans found in Set Builder yet.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4">
                {filteredUpcomingPlans?.map((plan) => (
                  <PlanCard
                    key={plan.id}
                    plan={plan}
                    isSelected={selectedPlan?.id === plan.id}
                    onSelect={() => setSelectedPlan(selectedPlan?.id === plan.id ? null : { id: plan.id, pco_plan_id: plan.pco_plan_id })}
                    songs={selectedPlan?.id === plan.id ? planSongs : undefined}
                    isLoadingSongs={selectedPlan?.id === plan.id && planSongsLoading}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          {/* Plan History Tab */}
          <TabsContent value="history" className="space-y-4">
            <div className="flex items-center justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setHistorySortOrder(prev => prev === "newest" ? "oldest" : "newest");
                  setHistoryPage(1);
                }}
                className="gap-2"
              >
                {historySortOrder === "newest" ? (
                  <>
                    <ArrowDown className="h-4 w-4" />
                    Newest First
                  </>
                ) : (
                  <>
                    <ArrowUp className="h-4 w-4" />
                    Oldest First
                  </>
                )}
              </Button>
            </div>
            {historyPlansLoading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-24 w-full" />
                ))}
              </div>
            ) : historyPlans.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center text-muted-foreground">
                  <Calendar className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No past plans found.</p>
                </CardContent>
              </Card>
            ) : (
              <>
                <div className="text-sm text-muted-foreground">
                  Showing {Math.min((historyPage - 1) * PLANS_PER_PAGE + 1, historyTotal)} - {Math.min(historyPage * PLANS_PER_PAGE, historyTotal)} of {historyTotal} plans
                </div>
                <div className="grid gap-4">
                  {historyPlans.map((plan) => (
                    <PlanCard
                      key={plan.id}
                      plan={plan}
                      isSelected={selectedPlan?.id === plan.id}
                      onSelect={() => setSelectedPlan(selectedPlan?.id === plan.id ? null : { id: plan.id, pco_plan_id: plan.pco_plan_id })}
                      songs={selectedPlan?.id === plan.id ? planSongs : undefined}
                      isLoadingSongs={selectedPlan?.id === plan.id && planSongsLoading}
                      isPast
                    />
                  ))}
                </div>
                {/* Pagination Controls */}
                {historyTotalPages > 1 && (
                  <div className="flex items-center justify-center gap-2 pt-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setHistoryPage(1)}
                      disabled={historyPage === 1}
                    >
                      First
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setHistoryPage(p => Math.max(1, p - 1))}
                      disabled={historyPage === 1}
                    >
                      Previous
                    </Button>
                    <div className="flex items-center gap-1">
                      <span className="text-sm">Page</span>
                      <input
                        type="number"
                        min={1}
                        max={historyTotalPages}
                        value={historyPage}
                        onChange={(e) => {
                          const page = parseInt(e.target.value) || 1;
                          const maxPage = historyTotalPages;
                          setHistoryPage(Math.min(Math.max(1, page), maxPage));
                        }}
                        className="w-16 h-8 text-center text-sm border rounded bg-background"
                      />
                      <span className="text-sm">of {historyTotalPages}</span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setHistoryPage(p => Math.min(historyTotalPages, p + 1))}
                      disabled={historyPage >= historyTotalPages}
                    >
                      Next
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setHistoryPage(historyTotalPages)}
                      disabled={historyPage >= historyTotalPages}
                    >
                      Last
                    </Button>
                  </div>
                )}
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}

interface PlanCardProps {
  plan: {
    id: string;
    pco_plan_id: string;
    service_type_name: string;
    plan_date: string;
    plan_title: string | null;
  };
  isSelected: boolean;
  onSelect: () => void;
  songs?: { song: { id: string; title: string; author: string | null }; song_key: string | null }[];
  isLoadingSongs?: boolean;
  isPast?: boolean;
}

function PlanCard({ plan, isSelected, onSelect, songs, isLoadingSongs, isPast }: PlanCardProps) {
  return (
    <Card 
      className={cn(
        "cursor-pointer transition-colors",
        isSelected && "ring-2 ring-primary",
        isPast && "opacity-75"
      )}
      onClick={onSelect}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">
              {format(parseISO(plan.plan_date), "EEEE, MMMM d, yyyy")}
            </CardTitle>
            <p className="text-sm text-muted-foreground">{plan.service_type_name}</p>
          </div>
          <ChevronRight className={cn(
            "h-5 w-5 text-muted-foreground transition-transform",
            isSelected && "rotate-90"
          )} />
        </div>
      </CardHeader>
      {isSelected && (
        <CardContent>
          {isLoadingSongs ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : songs?.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">No songs in this plan</p>
          ) : (
            <div className="space-y-2">
              {songs?.map((item, index) => (
                <div
                  key={item.song.id + index}
                  className="flex items-center justify-between py-2 border-b last:border-0"
                >
                  <div>
                    <p className="font-medium">{item.song.title}</p>
                    <p className="text-sm text-muted-foreground">{item.song.author || "Unknown"}</p>
                  </div>
                  {item.song_key && (
                    <Badge variant="outline">{item.song_key}</Badge>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
