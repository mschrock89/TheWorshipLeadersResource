import { useState, useMemo, useEffect } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, Plus, Trash2, X, Star, Heart, Zap, Diamond, ArrowLeftRight, ArrowRightLeft, Music, Home, MicVocal, Guitar, Monitor, Volume2, Video, Building2, CalendarDays } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { useAuth } from "@/hooks/useAuth";
import { useUserRoles } from "@/hooks/useUserRoles";
import { useEventsForMonth, useCreateEvent, useDeleteEvent, Event } from "@/hooks/useEvents";
import { useCreateCustomService, useCustomServiceOccurrences, useDeleteCustomService } from "@/hooks/useCustomServices";
import { useTeamSchedule, useRotationPeriodForDate } from "@/hooks/useTeamSchedule";
import { useMyTeamAssignments } from "@/hooks/useMyTeamAssignments";
import { usePendingSwapRequestsCount } from "@/hooks/useSwapRequests";
import { useTeamRosterForDate } from "@/hooks/useTeamRosterForDate";
import { useSongsForDate } from "@/hooks/useSongs";
import { useCampuses, useUserCampuses } from "@/hooks/useCampuses";
import { useUserRole } from "@/hooks/useUserRoles";
import { useUserSwapsForDate } from "@/hooks/useUserSwapsForDate";
import { useUserSwaps, getSwapStatusForDate } from "@/hooks/useUserSwaps";
import { SwapButton } from "@/components/calendar/SwapButton";
import { SwapRequestDialog } from "@/components/calendar/SwapRequestDialog";
import { SwapsSheet } from "@/components/calendar/SwapsSheet";
import { RefreshableContainer } from "@/components/layout/RefreshableContainer";
import { useCampusSelectionOptional } from "@/components/layout/CampusSelectionContext";
import { POSITION_LABELS, MINISTRY_TYPES } from "@/lib/constants";
import { SET_PLANNER_MINISTRY_OPTIONS } from "@/lib/constants";
import { isAuditionCandidateRole } from "@/lib/access";
import { useUpcomingAudition } from "@/hooks/useAuditions";
import { supabase } from "@/integrations/supabase/client";
import { useExistingSet, useDraftSetSongs } from "@/hooks/useSetPlanner";
import { useCustomServiceAssignments } from "@/hooks/useCustomServices";
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const teamIcons: Record<string, React.ElementType> = {
  star: Star,
  heart: Heart,
  zap: Zap,
  diamond: Diamond
};
function StandardCalendar() {
  const {
    canManageTeam,
    user
  } = useAuth();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isSwapOpen, setIsSwapOpen] = useState(false);
  const [isSwapsSheetOpen, setIsSwapsSheetOpen] = useState(false);

  // Use the global campus selection from context
  const campusContext = useCampusSelectionOptional();
  const [localCampusFilter, setLocalCampusFilter] = useState<string>("");
  const campusFilter = campusContext?.selectedCampusId || localCampusFilter;
  const setCampusFilter = campusContext?.setSelectedCampusId || setLocalCampusFilter;
  const [ministryFilter, setMinistryFilter] = useState<string>("weekend_team");
  const [newEvent, setNewEvent] = useState({
    event_type: "team_event" as "team_event" | "service",
    title: "",
    description: "",
    start_time: "",
    end_time: "",
    ministry_type: "weekend",
    campus_id: "",
    repeats_weekly: false,
  });

  // Scroll to top on mount
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const {
    data: events = [],
    isLoading
  } = useEventsForMonth(year, month);
  const monthStart = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const monthEnd = `${year}-${String(month + 1).padStart(2, "0")}-${String(new Date(year, month + 1, 0).getDate()).padStart(2, "0")}`;
  const {
    data: customServices = [],
  } = useCustomServiceOccurrences({
    campusId: campusFilter && campusFilter !== "network-wide" ? campusFilter : undefined,
    ministryType: ministryFilter && ministryFilter !== "all" && ministryFilter !== "weekend_team" ? ministryFilter : undefined,
    startDate: monthStart,
    endDate: monthEnd,
  });
  const { data: customAssignedDates = [] } = useQuery({
    queryKey: [
      "calendar-custom-assignment-dates",
      user?.id,
      monthStart,
      monthEnd,
      campusFilter,
      ministryFilter,
    ],
    enabled: !!user?.id,
    queryFn: async () => {
      let query = supabase
        .from("custom_service_assignments")
        .select("assignment_date, custom_services!inner(campus_id, ministry_type)")
        .eq("user_id", user!.id)
        .gte("assignment_date", monthStart)
        .lte("assignment_date", monthEnd);

      if (campusFilter && campusFilter !== "network-wide") {
        query = query.eq("custom_services.campus_id", campusFilter);
      }

      if (ministryFilter && ministryFilter !== "all") {
        if (ministryFilter === "weekend_team") {
          query = query.in("custom_services.ministry_type", ["weekend", "production", "video"]);
        } else {
          query = query.eq("custom_services.ministry_type", ministryFilter);
        }
      }

      const { data, error } = await query;
      if (error) throw error;

      return Array.from(new Set((data || []).map((row) => row.assignment_date)));
    },
  });
  const customAssignedDateSet = useMemo(() => new Set(customAssignedDates), [customAssignedDates]);
  // Get team schedule filtered by selected campus and rotation period (aligns with Team Builder)
  const effectiveCampusId = campusFilter && campusFilter !== "network-wide" ? campusFilter : null;
  // Use 15th of displayed month to determine which rotation period applies (matches Team Builder)
  const referenceDateForPeriod = useMemo(
    () => (effectiveCampusId ? new Date(year, month, 15) : null),
    [effectiveCampusId, year, month]
  );
  const { data: rotationPeriodName } = useRotationPeriodForDate(
    effectiveCampusId,
    referenceDateForPeriod
  );
  const {
    data: teamSchedule = []
  } = useTeamSchedule(rotationPeriodName ?? undefined, effectiveCampusId);
  const {
    scheduledDates,
    uniqueTeams
  } = useMyTeamAssignments();
  const createEvent = useCreateEvent();
  const createCustomService = useCreateCustomService();
  const deleteCustomService = useDeleteCustomService();
  const deleteEvent = useDeleteEvent();
  const {
    data: pendingSwaps = 0
  } = usePendingSwapRequestsCount();

  // Check if user has swapped out/in for the selected date
  const {
    data: userSwapStatus
  } = useUserSwapsForDate(selectedDate);

  // Fetch all user swaps for calendar grid highlighting
  const {
    data: allUserSwaps
  } = useUserSwaps();

  // Get campuses for service times
  const {
    data: campuses = []
  } = useCampuses();
  const {
    data: userCampuses = []
  } = useUserCampuses(user?.id);
  const {
    data: userRole
  } = useUserRole(user?.id);

  // Check if user is a campus admin
  const isCampusAdmin = userRole === 'campus_admin' || userRole === 'admin';

  // Set default campus filter only if context is not available
  useEffect(() => {
    if (campusContext) return; // Context handles the default
    if (!localCampusFilter && userCampuses.length > 0) {
      const primaryCampus = userCampuses[0]?.campuses?.id;
      if (primaryCampus) {
        setLocalCampusFilter(primaryCampus);
      } else {
        setLocalCampusFilter("network-wide");
      }
    }
  }, [userCampuses, localCampusFilter, campusContext]);

  useEffect(() => {
    if (newEvent.campus_id) return;
    const defaultCampusId =
      campusFilter && campusFilter !== "network-wide"
        ? campusFilter
        : userCampuses[0]?.campus_id || campuses[0]?.id || "";
    if (!defaultCampusId) return;
    setNewEvent((prev) => ({ ...prev, campus_id: defaultCampusId }));
  }, [newEvent.campus_id, campusFilter, userCampuses, campuses]);

  // Helper to get service times for a selected date
  const getServiceTimesForDate = (date: Date) => {
    const dayOfWeek = date.getDay(); // 0 = Sunday, 6 = Saturday
    const isSaturday = dayOfWeek === 6;
    const isSunday = dayOfWeek === 0;
    if (!isSaturday && !isSunday) return null;

    // Get campuses that have service on this day
    let relevantCampuses = campuses.filter(c => {
      if (isSaturday) return c.has_saturday_service;
      if (isSunday) return c.has_sunday_service;
      return false;
    });

    // Apply campus filter for campus admins - hide service times for network-wide view
    if (isCampusAdmin && campusFilter === "network-wide") {
      return null; // Don't show service times for network-wide events view
    } else if (isCampusAdmin && campusFilter !== "network-wide") {
      relevantCampuses = relevantCampuses.filter(c => c.id === campusFilter);
    }
    if (relevantCampuses.length === 0) return null;
    return relevantCampuses.map(c => ({
      campusName: c.name,
      times: isSaturday ? c.saturday_service_time : c.sunday_service_time
    }));
  };

  // Format time helper for service times
  const formatServiceTime = (timeString: string): string => {
    if (!timeString) return "";
    const [hours, minutes] = timeString.split(":");
    const hour = parseInt(hours, 10);
    const ampm = hour >= 12 ? "PM" : "AM";
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };
  const formatServiceTimes = (times: string[] | null): string => {
    if (!times || times.length === 0) return "";
    return times.map(t => formatServiceTime(t)).join(", ");
  };

  const selectedCampusConfig = useMemo(() => {
    if (!campusFilter || campusFilter === "network-wide") return null;
    return campuses.find((c) => c.id === campusFilter) || null;
  }, [campusFilter, campuses]);

  // True when the currently-scoped campus context actually has a weekend service on this date.
  // Prevents false weekend highlights for campuses that only run Sunday services.
  const hasServiceForDateInScope = (date: Date): boolean => {
    const dayOfWeek = date.getDay();
    const isSaturday = dayOfWeek === 6;
    const isSunday = dayOfWeek === 0;

    if (!isSaturday && !isSunday) return true;

    if (selectedCampusConfig) {
      return isSaturday
        ? !!selectedCampusConfig.has_saturday_service
        : !!selectedCampusConfig.has_sunday_service;
    }

    // Network-wide admin view hides weekends entirely.
    if (isCampusAdmin && campusFilter === "network-wide") return false;

    // For users without a single selected campus, use their assigned campuses when possible.
    const scopedCampuses =
      !isCampusAdmin && userCampuses.length > 0
        ? campuses.filter((c) => userCampuses.some((uc) => uc.campus_id === c.id))
        : campuses;

    if (scopedCampuses.length === 0) return false;
    return scopedCampuses.some((c) =>
      isSaturday ? !!c.has_saturday_service : !!c.has_sunday_service
    );
  };

  // Check if user is scheduled on a specific day (filtered by campus for volunteers)
  const getUserScheduleForDay = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const dateForDay = new Date(year, month, day);
    const dayOfWeek = dateForDay.getDay();
    const isSaturday = dayOfWeek === 6;
    const isSunday = dayOfWeek === 0;

    // When a specific campus is selected, don't show schedule for days that campus doesn't have service
    // (e.g. Tullahoma, Shelbyville, Murfreesboro North have no Saturday service)
    if (campusFilter && campusFilter !== "network-wide") {
      const selectedCampus = campuses.find(c => c.id === campusFilter);
      if (selectedCampus) {
        if (isSaturday && !selectedCampus.has_saturday_service) return null;
        if (isSunday && !selectedCampus.has_sunday_service) return null;
      }
      // Filter by selected campus - only show schedule at this campus
      const match = scheduledDates.find(s => s.scheduleDate === dateStr && (s.campusId === campusFilter || !s.campusId));
      return match;
    }

    // Network-wide or no campus filter - filter by campus for non-admin users with multiple campuses
    if (!isCampusAdmin && userCampuses.length > 1 && campusFilter && campusFilter !== "network-wide") {
      return scheduledDates.find(s => s.scheduleDate === dateStr && s.campusId === campusFilter);
    }
    return scheduledDates.find(s => s.scheduleDate === dateStr);
  };

  // Check if a day is a weekend (Saturday or Sunday)
  const isWeekendDay = (day: number): boolean => {
    const date = new Date(year, month, day);
    const dayOfWeek = date.getDay();
    return dayOfWeek === 0 || dayOfWeek === 6; // Sunday = 0, Saturday = 6
  };

  // Build calendar grid
  const calendarDays = useMemo(() => {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDay = firstDay.getDay();
    const days: (number | null)[] = [];

    // Empty cells before first day
    for (let i = 0; i < startingDay; i++) {
      days.push(null);
    }

    // Days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(day);
    }
    return days;
  }, [year, month]);

  // Check if we should hide weekends (for network-wide view)
  const hideWeekends = isCampusAdmin && campusFilter === "network-wide";

  // Get events for a specific day
  const getEventsForDay = (day: number): Event[] => {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    let filteredEvents = events.filter(e => e.event_date === dateStr);

    // Apply campus filter for campus admins
    if (isCampusAdmin && campusFilter === "network-wide") {
      // For network-wide view, only show events without a campus (network-wide events)
      filteredEvents = filteredEvents.filter(e => e.campus_id === null);
    } else if (isCampusAdmin && campusFilter !== "network-wide") {
      filteredEvents = filteredEvents.filter(e => e.campus_id === campusFilter || e.campus_id === null);
    }
    return filteredEvents;
  };
  const getCustomServicesForDay = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return customServices.filter((service) => service.occurrence_date === dateStr);
  };

  // Get events for selected date
  const selectedDayEvents = selectedDate ? getEventsForDay(selectedDate.getDate()) : [];
  const selectedDayServices = selectedDate ? getCustomServicesForDay(selectedDate.getDate()) : [];
  const selectedPrimaryService = selectedDayServices[0] || null;

  // Get team schedule for a specific day
  // Note: Midweek ministries (e.g. Encounter) should still show even if the user isn't personally scheduled.
  const getTeamForDay = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const dateForDay = new Date(year, month, day);
    const dayOfWeek = dateForDay.getDay();
    const isSaturday = dayOfWeek === 6;
    const isSunday = dayOfWeek === 0;
    const isMidweek = dayOfWeek === 3; // Wednesday

    // Check if selected campus has service on this day
    if (campusFilter && campusFilter !== "network-wide") {
      const selectedCampus = campuses.find(c => c.id === campusFilter);
      if (selectedCampus) {
        // Skip if Saturday and campus doesn't have Saturday service
        if (isSaturday && !selectedCampus.has_saturday_service) return null;
        // Skip if Sunday and campus doesn't have Sunday service
        if (isSunday && !selectedCampus.has_sunday_service) return null;
      }
    }

    // There can be multiple schedule entries per date (different ministries)
    let entries = teamSchedule.filter(s => s.schedule_date === dateStr);

    // Apply ministry filter when selected
    if (ministryFilter && ministryFilter !== "all") {
      // "weekend_team" combines weekend, production, and video
      if (ministryFilter === "weekend_team") {
        entries = entries.filter(s => ["weekend", "production", "video"].includes(s.ministry_type));
      } else {
        entries = entries.filter(s => s.ministry_type === ministryFilter);
      }
    }

    // Pick a single entry (Encounter/EON first when multiple exist)
    const ministryPriority = ["encounter", "eon", "eon_weekend", "weekend", "sunday_am", "production", "video"];
    const teamEntry = entries.sort((a, b) => {
      const aIdx = ministryPriority.indexOf(a.ministry_type);
      const bIdx = ministryPriority.indexOf(b.ministry_type);
      return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
    })[0];
    if (!teamEntry) return null;

    // If no campus filter or network-wide, show the team entry
    if (!campusFilter || campusFilter === "network-wide") {
      return teamEntry;
    }

    // If a specific campus is selected, only show team if user is scheduled at that campus
    // OR if it's a weekend rotation OR a midweek scheduled ministry (Encounter/EON/etc.)
    const userScheduleForDay = scheduledDates.find(s => s.scheduleDate === dateStr && (s.campusId === campusFilter || !s.campusId));
    const isWeekend = isSaturday || isSunday;
    if (userScheduleForDay || isWeekend || isMidweek) {
      return teamEntry;
    }
    return null;
  };

  // Get team for selected date
  const selectedDayTeam = selectedDate ? getTeamForDay(selectedDate.getDate()) : null;
  const navigateMonth = (direction: number) => {
    setCurrentDate(new Date(year, month + direction, 1));
    setSelectedDate(null);
  };
  const isToday = (day: number) => {
    const today = new Date();
    return day === today.getDate() && month === today.getMonth() && year === today.getFullYear();
  };
  const isSelected = (day: number) => {
    return selectedDate && day === selectedDate.getDate() && month === selectedDate.getMonth() && year === selectedDate.getFullYear();
  };
  const handleAddEvent = async () => {
    if (!selectedDate || !newEvent.title.trim()) return;
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(selectedDate.getDate()).padStart(2, "0")}`;
    if (newEvent.event_type === "service") {
      if (!newEvent.campus_id) return;
      await createCustomService.mutateAsync({
        campus_id: newEvent.campus_id,
        ministry_type: newEvent.ministry_type,
        service_name: newEvent.title,
        service_date: dateStr,
        start_time: newEvent.start_time || undefined,
        end_time: newEvent.end_time || undefined,
        repeats_weekly: newEvent.repeats_weekly,
      });
    } else {
      await createEvent.mutateAsync({
        title: newEvent.title,
        description: newEvent.description || undefined,
        event_date: dateStr,
        start_time: newEvent.start_time || undefined,
        end_time: newEvent.end_time || undefined,
        campus_id: campusFilter && campusFilter !== "network-wide" ? campusFilter : undefined,
      });
    }
    setNewEvent({
      event_type: "team_event",
      title: "",
      description: "",
      start_time: "",
      end_time: "",
      ministry_type: "weekend",
      campus_id: "",
      repeats_weekly: false,
    });
    setIsAddOpen(false);
  };
  const formatTime = (time: string | null) => {
    if (!time) return "";
    const [hours, minutes] = time.split(":");
    const h = parseInt(hours);
    const ampm = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 || 12;
    return `${h12}:${minutes} ${ampm}`;
  };
  return <RefreshableContainer queryKeys={[["events"], ["team-schedule"], ["my-team-assignments"], ["swap-requests-count"], ["calendar-custom-assignment-dates"]]}>
      <div className="min-h-screen bg-background p-3 md:p-6 overflow-x-hidden">
        <div className="mx-auto max-w-4xl w-full">
          {/* Breadcrumb Navigation - hidden on mobile for space */}
          <Breadcrumb className="mb-3 hidden md:block">
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
                <BreadcrumbPage>Calendar</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          {/* Mobile-optimized header */}
          <div className="mb-4 space-y-2">
            {/* Filters - stacked on mobile, row on desktop */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              {/* Campus selector - for admins OR volunteers with multiple campuses */}
              {isCampusAdmin && campuses.length > 0 || !isCampusAdmin && userCampuses.length > 1 ? <Select value={campusFilter} onValueChange={setCampusFilter}>
                  <SelectTrigger className="w-full sm:w-auto sm:min-w-[200px] h-9 text-sm bg-background border-border">
                    <Building2 className="h-4 w-4 mr-2 text-muted-foreground flex-shrink-0" />
                    <SelectValue placeholder="Campus" />
                  </SelectTrigger>
                  <SelectContent>
                    {isCampusAdmin && <SelectItem value="network-wide">Network Wide Events</SelectItem>}
                    {(isCampusAdmin ? campuses : userCampuses.map(uc => uc.campuses)).filter(Boolean).map(campus => <SelectItem key={campus?.id} value={campus?.id || ""}>
                        {campus?.name}
                      </SelectItem>)}
                  </SelectContent>
                </Select> : null}
              {/* Ministry Filter */}
              <Select value={ministryFilter} onValueChange={setMinistryFilter}>
                <SelectTrigger className="w-full sm:w-auto sm:min-w-[160px] h-9 text-sm bg-background border-border">
                  <Music className="h-4 w-4 mr-2 text-muted-foreground flex-shrink-0" />
                  <SelectValue placeholder="Ministry" />
                </SelectTrigger>
                <SelectContent>
                  {MINISTRY_TYPES.filter(m => !('hidden' in m && m.hidden) && !['production', 'video'].includes(m.value)).map(ministry => <SelectItem key={ministry.value} value={ministry.value}>
                      {ministry.label}
                    </SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            
            {/* Month navigation - separate row on mobile */}
            <div className="flex items-center justify-center sm:justify-end">
              <Button variant="ghost" size="icon" onClick={() => navigateMonth(-1)} className="text-foreground hover:bg-card h-8 w-8">
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <span className="text-center font-medium whitespace-nowrap min-w-[120px] text-primary text-base">
                {MONTHS[month]} {year}
              </span>
              <Button variant="ghost" size="icon" onClick={() => navigateMonth(1)} className="text-foreground hover:bg-card h-8 w-8">
                <ChevronRight className="h-5 w-5" />
              </Button>
            </div>
          </div>

          {/* Calendar Grid */}
          <div className="mb-4 rounded-lg border border-border bg-card p-2 sm:p-4 overflow-hidden">
            {/* Weekday headers */}
            <div className={`mb-1 sm:mb-2 grid gap-0.5 sm:gap-1 ${hideWeekends ? 'grid-cols-5' : 'grid-cols-7'}`}>
              {WEEKDAYS.filter((_, idx) => !hideWeekends || idx !== 0 && idx !== 6).map(day => <div key={day} className="py-1 sm:py-2 text-center text-[10px] sm:text-xs font-medium text-muted-foreground">
                  {day}
                </div>)}
            </div>

            {/* Days grid */}
            <div className={`grid gap-0.5 sm:gap-1 ${hideWeekends ? 'grid-cols-5' : 'grid-cols-7'}`}>
              {calendarDays.map((day, index) => {
              // For network-wide view, skip weekend days and their empty cells
              if (hideWeekends) {
                const dayOfWeek = index % 7;
                if (dayOfWeek === 0 || dayOfWeek === 6) {
                  return null; // Skip Sunday (0) and Saturday (6)
                }
              }
              if (day === null) {
                return <div key={`empty-${index}`} className="aspect-square" />;
              }
              const dayEvents = getEventsForDay(day);
              const dayServices = getCustomServicesForDay(day);
              const hasEvents = dayEvents.length > 0 || dayServices.length > 0;
              const teamEntry = hideWeekends ? null : getTeamForDay(day); // Don't show team icons in network-wide view
              const TeamIcon = teamEntry?.worship_teams?.icon ? teamIcons[teamEntry.worship_teams.icon] : null;
              const teamColor = teamEntry?.worship_teams?.color;
              const userSchedule = hideWeekends ? null : getUserScheduleForDay(day); // Don't show user schedule in network-wide view

              // Check swap status for this day
              const dateStrForDay = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const hasCustomAssignment = customAssignedDateSet.has(dateStrForDay);
              const swapStatus = getSwapStatusForDate(dateStrForDay, allUserSwaps);
              const dateForDay = new Date(year, month, day);
              const hasServiceForDayInScope = hasServiceForDateInScope(dateForDay);

              // Effective schedule: user is playing if (scheduled AND NOT swapped out) OR (swapped in)
              const isScheduledAndNotSwappedOut = !!userSchedule && !swapStatus.swappedOut;
              const isSwappedIn = swapStatus.swappedIn && hasServiceForDayInScope;
              const isSwappedOut = swapStatus.swappedOut && !!userSchedule; // Only show swapped-out styling if originally scheduled
              const isUserEffectivelyScheduled = isScheduledAndNotSwappedOut || isSwappedIn;

              // Determine the effective team color for highlighting.
              // Prefer the team shown for the day (teamEntry) so the outline matches the icon/color.
              // For swapped-in dates, use the swap's team color (fallback to amber if unavailable).
              const swapTeamColor = swapStatus.swapInDetails?.worship_teams?.color;
              const effectiveTeamColor = isSwappedIn ? swapTeamColor || "#f59e0b" // amber-500 fallback for swaps
              : teamColor || userSchedule?.teamColor;

              // Check if this is a midweek (Wednesday) service that the user is scheduled for
              const isWednesday = dateForDay.getDay() === 3;
              // Only show midweek highlighting if user is actually scheduled for this midweek date
              const isMidweekService = isWednesday && teamEntry && isUserEffectivelyScheduled;

              // Styling for swapped-out dates (dimmed with dashed border)
              const swappedOutStyle = isSwappedOut && !isSelected(day) && userSchedule?.teamColor ? {
                boxShadow: `inset 0 0 0 1px ${userSchedule.teamColor}40`,
                opacity: 0.5
              } : undefined;
              // Show highlight when user is scheduled OR when a team is scheduled (colored border + background)
              const showTeamHighlight = hasServiceForDayInScope && (isUserEffectivelyScheduled || teamEntry) && !isSelected(day) && effectiveTeamColor;
              const showCustomAssignmentHighlight = hasCustomAssignment && !isSelected(day) && !showTeamHighlight;
              return <button key={day} onClick={() => setSelectedDate(new Date(year, month, day))} className={`relative flex aspect-square flex-col items-center justify-center rounded-md transition-colors ${isSelected(day) ? "bg-accent text-accent-foreground" : isToday(day) ? "ring-2 ring-primary text-foreground" : "text-foreground hover:bg-muted"}`} style={isSwappedOut && !isSelected(day) ? swappedOutStyle : showTeamHighlight ? {
                boxShadow: `inset 0 0 0 2px ${effectiveTeamColor}`,
                backgroundColor: `${effectiveTeamColor}15`
              } : showCustomAssignmentHighlight ? {
                boxShadow: "inset 0 0 0 2px #0ea5e9",
                backgroundColor: "rgba(14, 165, 233, 0.12)"
              } : isMidweekService && !isSelected(day) ? {
                backgroundColor: `${teamColor}10`
              } : undefined}>
                    <span className={`text-sm font-medium ${isSwappedOut ? 'line-through text-muted-foreground' : ''}`}>{day}</span>
                    <div className="absolute bottom-1 flex items-center gap-0.5">
                      {isSwappedIn && <ArrowRightLeft className="h-2.5 w-2.5 text-amber-500" />}
                      {isSwappedOut && <ArrowRightLeft className="h-2.5 w-2.5 text-red-400" />}
                      {isMidweekService && <span className="text-[8px] font-medium text-purple-500 mr-0.5">MID</span>}
                      {TeamIcon && !isSwappedOut && <TeamIcon className="h-3 w-3" style={{
                    color: teamColor
                  }} />}
                      {hasEvents && !TeamIcon && !isSwappedIn && !isSwappedOut && <div className="h-1.5 w-1.5 rounded-full bg-primary" />}
                      {hasCustomAssignment && !isSwappedOut && <div className="h-1.5 w-1.5 rounded-full bg-sky-500" />}
                    </div>
                  </button>;
            })}
            </div>
          </div>

          {/* Selected Day Panel */}
          {selectedDate && (() => {
          const userSchedule = getUserScheduleForDay(selectedDate.getDate());
          const serviceTimes = getServiceTimesForDate(selectedDate);

          // Determine effective schedule considering swaps:
          // - If user has swapped OUT, they're NOT playing on this date (even if on home team)
          // - If user has swapped IN, they ARE playing on this date (covering for someone)
          const hasSwappedOut = userSwapStatus?.swappedOut || false;
          const hasSwappedIn = (userSwapStatus?.swappedIn || false) && hasServiceForDateInScope(selectedDate);
          const swapInDetails = userSwapStatus?.swapInDetails;

          // User is playing if: (on home team AND NOT swapped out) OR (swapped in)
          const isPlayingThisWeekend = userSchedule && !hasSwappedOut || hasSwappedIn;

          // Determine what team info to show
          const effectiveTeam = hasSwappedIn && swapInDetails?.worship_teams ? {
            teamName: swapInDetails.worship_teams.name,
            teamColor: swapInDetails.worship_teams.color,
            position: swapInDetails.position,
            teamId: swapInDetails.team_id
          } : userSchedule && !hasSwappedOut ? {
            teamName: userSchedule.teamName,
            teamColor: userSchedule.teamColor,
            position: userSchedule.position,
            teamId: userSchedule.teamId
          } : null;
          return <div className="rounded-lg border border-border bg-card p-3 sm:p-4">
                {/* Header Row */}
                <div className="flex items-start justify-between mb-2 gap-2">
                  <div className="min-w-0 flex-1">
                    <h2 className="text-base sm:text-lg font-semibold text-foreground">
                      {MONTHS[selectedDate.getMonth()]} {selectedDate.getDate()}, {selectedDate.getFullYear()}
                    </h2>
                    {/* Service Times */}
                    {serviceTimes && serviceTimes.length > 0 && <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                        {serviceTimes.map((st, idx) => <span key={idx} className="text-xs text-muted-foreground">
                            <span className="font-medium text-foreground/70">{st.campusName}</span>
                            {st.times && st.times.length > 0 && <span className="ml-1">@ {formatServiceTimes(st.times)}</span>}
                          </span>)}
                      </div>}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button variant="outline" size="sm" className="gap-1.5 h-7 px-2 relative border-ecc-yellow hover:bg-ecc-yellow/10" onClick={() => setIsSwapsSheetOpen(true)}>
                      <ArrowLeftRight className="h-3.5 w-3.5 text-ecc-yellow" />
                      <span className="text-xs hidden sm:inline">Swaps</span>
                      {pendingSwaps > 0 && <Badge variant="destructive" className="absolute -top-1.5 -right-1.5 h-4 min-w-4 px-1 text-[10px] flex items-center justify-center">
                          {pendingSwaps > 99 ? "99+" : pendingSwaps}
                        </Badge>}
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setSelectedDate(null)} className="text-muted-foreground hover:text-foreground h-7 w-7">
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* User Schedule Section - Show if playing (home team without swap out, OR swapped in) */}
                {effectiveTeam && <div className="mb-3 sm:mb-4 rounded-lg p-2.5 sm:p-3" style={{
              backgroundColor: `${effectiveTeam.teamColor}10`,
              border: `1px solid ${effectiveTeam.teamColor}30`
            }}>
                    <div className="flex items-center justify-between gap-2 sm:gap-3 flex-wrap">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="h-2 w-2 rounded-full flex-shrink-0" style={{
                    backgroundColor: effectiveTeam.teamColor
                  }} />
                        <span className="text-xs sm:text-sm font-medium truncate" style={{
                    color: effectiveTeam.teamColor
                  }}>
                          {hasSwappedIn ? "Covering for " : "Playing with "}{effectiveTeam.teamName}
                        </span>
                      </div>
                      {/* Only show swap button if user is on their home team (not swapped in) */}
                      {!hasSwappedIn && <SwapButton onClick={() => setIsSwapOpen(true)} />}
                    </div>
                  </div>}

                {/* Team Playing Section (if different from user's team or user not scheduled) */}
                {selectedDayTeam?.worship_teams && !effectiveTeam && <div className="mb-4 flex items-center gap-2">
                    {(() => {
                const TeamIcon = teamIcons[selectedDayTeam.worship_teams.icon];
                return TeamIcon ? <TeamIcon className="h-4 w-4" style={{
                  color: selectedDayTeam.worship_teams.color
                }} /> : null;
              })()}
                    <span className="text-sm font-medium" style={{
                color: selectedDayTeam.worship_teams.color
              }}>
                      {selectedDayTeam.worship_teams.name} Playing
                    </span>
                    {selectedDayTeam.notes && <span className="rounded bg-primary/20 px-2 py-0.5 text-xs font-medium text-primary">
                        {selectedDayTeam.notes}
                      </span>}
                  </div>}

                {/* Songs Section */}
                {selectedPrimaryService ? (
                  <CustomServiceSongsPreview
                    customServiceId={selectedPrimaryService.id}
                    planDate={selectedPrimaryService.occurrence_date}
                    campusId={selectedPrimaryService.campus_id}
                    ministryType={selectedPrimaryService.ministry_type}
                  />
                ) : (
                  <SongsPreview date={selectedDate} campusId={campusFilter !== "network-wide" ? campusFilter : undefined} ministryFilter={ministryFilter} />
                )}

                {/* Band Roster Section */}
                <div className="flex items-center justify-between mb-2 gap-2">
                  <span className="text-xs sm:text-sm font-medium text-muted-foreground">Team Roster</span>
                </div>
                
                {/* Team roster */}
                {selectedPrimaryService ? (
                  <CustomServiceRoster
                    customServiceId={selectedPrimaryService.id}
                    assignmentDate={selectedPrimaryService.occurrence_date}
                  />
                ) : (() => {
              const dateStr = selectedDate.toISOString().split("T")[0];
              let scheduleEntries = teamSchedule.filter(s => s.schedule_date === dateStr);
              if (ministryFilter && ministryFilter !== "all") {
                scheduleEntries = scheduleEntries.filter(s => s.ministry_type === ministryFilter);
              }
              const scheduledMinistries = scheduleEntries.map(s => s.ministry_type).filter((m): m is string => Boolean(m));
              return <BandRoster date={selectedDate} teamId={selectedDayTeam?.team_id} showAudioVideo={canManageTeam} ministryFilter={ministryFilter} scheduledMinistries={scheduledMinistries} campusId={campusFilter !== "network-wide" ? campusFilter : undefined} />;
            })()}

                {/* Events Section */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                      {selectedDayEvents.length + selectedDayServices.length === 0
                        ? "No events"
                        : `${selectedDayEvents.length + selectedDayServices.length} item${selectedDayEvents.length + selectedDayServices.length > 1 ? "s" : ""}`}
                    </p>
                    {canManageTeam && <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
                        <DialogTrigger asChild>
                          <Button size="sm" variant="outline" className="gap-1 h-7 text-xs">
                            <Plus className="h-3 w-3" />
                            Add Event
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="bg-card">
                          <DialogHeader>
                            <DialogTitle>Add Event</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4 pt-4">
                            <div>
                              <Label htmlFor="event_type">Event Type</Label>
                              <Select value={newEvent.event_type} onValueChange={(value: "team_event" | "service") => setNewEvent({
                          ...newEvent,
                          event_type: value
                        })}>
                                <SelectTrigger id="event_type">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="service">Service</SelectItem>
                                  <SelectItem value="team_event">Team Event</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <Label htmlFor="title">{newEvent.event_type === "service" ? "Service Name" : "Title"}</Label>
                              <Input id="title" value={newEvent.title} onChange={e => setNewEvent({
                          ...newEvent,
                          title: e.target.value
                        })} placeholder="Event title" />
                            </div>
                            {newEvent.event_type === "team_event" && <div>
                                <Label htmlFor="description">Description (optional)</Label>
                                <Textarea id="description" value={newEvent.description} onChange={e => setNewEvent({
                          ...newEvent,
                          description: e.target.value
                        })} placeholder="Event description" />
                              </div>}
                            {newEvent.event_type === "service" && <>
                                <div>
                                  <Label htmlFor="service-campus">Campus</Label>
                                  <Select value={newEvent.campus_id} onValueChange={value => setNewEvent({
                            ...newEvent,
                            campus_id: value
                          })}>
                                    <SelectTrigger id="service-campus">
                                      <SelectValue placeholder="Select campus" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {campuses.map(campus => <SelectItem key={campus.id} value={campus.id}>
                                          {campus.name}
                                        </SelectItem>)}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div>
                                  <Label htmlFor="service-ministry">Ministry</Label>
                                  <Select value={newEvent.ministry_type} onValueChange={value => setNewEvent({
                            ...newEvent,
                            ministry_type: value
                          })}>
                                    <SelectTrigger id="service-ministry">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {SET_PLANNER_MINISTRY_OPTIONS.map(option => <SelectItem key={option.value} value={option.value}>
                                          {option.label}
                                        </SelectItem>)}
                                    </SelectContent>
                                  </Select>
                                </div>
                              </>}
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <Label htmlFor="start_time">Start Time</Label>
                                <Input id="start_time" type="time" value={newEvent.start_time} onChange={e => setNewEvent({
                            ...newEvent,
                            start_time: e.target.value
                          })} />
                              </div>
                              <div>
                                <Label htmlFor="end_time">End Time</Label>
                                <Input id="end_time" type="time" value={newEvent.end_time} onChange={e => setNewEvent({
                            ...newEvent,
                            end_time: e.target.value
                          })} />
                              </div>
                            </div>
                            {newEvent.event_type === "service" && <div className="flex items-center gap-2">
                                <Checkbox id="repeats_weekly" checked={newEvent.repeats_weekly} onCheckedChange={checked => setNewEvent({
                            ...newEvent,
                            repeats_weekly: Boolean(checked)
                          })} />
                                <Label htmlFor="repeats_weekly" className="font-normal">Repeat weekly</Label>
                              </div>}
                            <Button onClick={handleAddEvent} disabled={!newEvent.title.trim() || (newEvent.event_type === "service" && !newEvent.campus_id) || createEvent.isPending || createCustomService.isPending} className="w-full">
                              {createEvent.isPending || createCustomService.isPending ? "Creating..." : newEvent.event_type === "service" ? "Create Service" : "Create Event"}
                            </Button>
                          </div>
                        </DialogContent>
                      </Dialog>}
                  </div>

                  {/* Event List */}
                  {selectedDayServices.map(service => {
                    const campusName = campuses.find((c) => c.id === service.campus_id)?.name || "Campus";
                    return <div key={service.occurrence_key} className="flex items-start justify-between rounded-md border-l-4 border-sky-500 bg-muted/50 p-3">
                        <div className="flex items-center justify-between gap-3 w-full">
                          <div>
                            <h3 className="font-medium text-foreground">{service.service_name}</h3>
                            <p className="mt-1 text-sm text-muted-foreground">{campusName} • Service</p>
                            {(service.start_time || service.end_time) && <p className="mt-1 text-xs text-primary">
                                {formatTime(service.start_time)}
                                {service.start_time && service.end_time && " – "}
                                {formatTime(service.end_time)}
                              </p>}
                          </div>
                          <Badge variant="secondary">Service</Badge>
                        </div>
                        {canManageTeam && <Button variant="ghost" size="icon" onClick={() => deleteCustomService.mutate(service.id)} disabled={deleteCustomService.isPending} className="h-8 w-8 text-destructive hover:bg-destructive/10">
                            <Trash2 className="h-4 w-4" />
                          </Button>}
                      </div>;
                  })}
                  {selectedDayEvents.map(event => <div key={event.id} className="flex items-start justify-between rounded-md border-l-4 border-primary bg-muted/50 p-3">
                      <div>
                        <h3 className="font-medium text-foreground">{event.title}</h3>
                        {event.description && <p className="mt-1 text-sm text-muted-foreground">{event.description}</p>}
                        {(event.start_time || event.end_time) && <p className="mt-1 text-xs text-primary">
                            {formatTime(event.start_time)}
                            {event.start_time && event.end_time && " – "}
                            {formatTime(event.end_time)}
                          </p>}
                      </div>
                      {canManageTeam && <Button variant="ghost" size="icon" onClick={() => deleteEvent.mutate(event.id)} className="h-8 w-8 text-destructive hover:bg-destructive/10">
                          <Trash2 className="h-4 w-4" />
                        </Button>}
                    </div>)}
                </div>

            {/* Swap Dialog - Only available for home team (not when covering/swapped in) */}
                {userSchedule && !hasSwappedOut && !hasSwappedIn && <SwapRequestDialog open={isSwapOpen} onOpenChange={setIsSwapOpen} originalDate={selectedDate} position={userSchedule.position || ""} teamId={userSchedule.teamId} teamName={userSchedule.teamName} campusId={userSchedule.campusId} />}
              </div>;
        })()}

          {isLoading && <div className="flex justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>}
        </div>

        <SwapsSheet open={isSwapsSheetOpen} onOpenChange={setIsSwapsSheetOpen} />
      </div>
    </RefreshableContainer>;
}

function AuditionCandidateCalendar() {
  const { user } = useAuth();
  const { data: audition, isLoading } = useUpcomingAudition(user?.id);

  const formatTime = (time: string | null) => {
    if (!time) return "";
    const [hours, minutes] = time.split(":");
    const h = Number(hours);
    const period = h >= 12 ? "PM" : "AM";
    const displayHour = h % 12 || 12;
    return `${displayHour}:${minutes} ${period}`;
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <h1 className="text-2xl font-bold text-foreground">My Audition Calendar</h1>

      {isLoading && (
        <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
          Loading audition details...
        </div>
      )}

      {!isLoading && !audition && (
        <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
          No upcoming audition is scheduled yet.
        </div>
      )}

      {!isLoading && audition && (
        <div className="space-y-3 rounded-lg border border-border bg-card p-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-lg font-semibold text-foreground">
              {new Date(`${audition.audition_date}T00:00:00`).toLocaleDateString(undefined, {
                weekday: "long",
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </p>
            <Badge variant="secondary">
              {audition.stage === "pre_audition" ? "Pre-Audition" : "Audition"}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {audition.campuses?.name || "Campus TBD"}
            {(audition.start_time || audition.end_time) && (
              <>
                {" • "}
                {formatTime(audition.start_time)}
                {audition.start_time && audition.end_time ? ` - ${formatTime(audition.end_time)}` : ""}
              </>
            )}
          </p>
          {audition.notes && <p className="text-sm text-foreground">{audition.notes}</p>}
        </div>
      )}
    </div>
  );
}

export default function Calendar() {
  const { user } = useAuth();
  const { data: roles = [] } = useUserRoles(user?.id);
  const isAuditionCandidate = isAuditionCandidateRole(roles.map((r) => r.role));

  if (isAuditionCandidate) {
    return <AuditionCandidateCalendar />;
  }

  return <StandardCalendar />;
}

// Band Roster Component
function BandRoster({
  date,
  teamId,
  showAudioVideo = true,
  campusId,
  ministryFilter,
  scheduledMinistries = []
}: {
  date: Date;
  teamId?: string;
  showAudioVideo?: boolean;
  campusId?: string;
  ministryFilter?: string;
  scheduledMinistries?: string[];
}) {
  // Pass ministry filter to hook - 'all' or undefined means fetch all (we'll constrain by scheduledMinistries below)
  // Special handling for "weekend_team" - it's a combined view, so we fetch without ministry filter
  // and filter the results client-side
  const isWeekendTeamFilter = ministryFilter === 'weekend_team';
  const effectiveMinistryFilter = ministryFilter && ministryFilter !== 'all' && !isWeekendTeamFilter ? ministryFilter : undefined;
  const {
    data: rosterRaw = [],
    isLoading
  } = useTeamRosterForDate(date, teamId, effectiveMinistryFilter, campusId);

  // If we're in "All" mode or "weekend_team" mode, constrain to appropriate ministries
  const roster = useMemo(() => {
    // For "weekend_team" filter, include weekend, production, and video ministries
    if (isWeekendTeamFilter) {
      const weekendTeamMinistries = new Set(["weekend", "production", "video"]);
      return rosterRaw.filter(m => m.ministryTypes.some(mt => weekendTeamMinistries.has(mt)));
    }
    if (effectiveMinistryFilter) return rosterRaw;
    if (!scheduledMinistries || scheduledMinistries.length === 0) return rosterRaw;
    const allowed = new Set(scheduledMinistries);
    // Always keep production/video members visible (they serve across ministries)
    const crossMinistry = new Set(["production", "video"]);
    return rosterRaw.filter(m => m.ministryTypes.some(mt => allowed.has(mt) || crossMinistry.has(mt)));
  }, [rosterRaw, effectiveMinistryFilter, scheduledMinistries, isWeekendTeamFilter]);
  if (!teamId) return null;
  if (isLoading) {
    return <div className="mb-4">
        <div className="animate-pulse space-y-2">
          {[1, 2, 3].map(i => <div key={i} className="h-8 bg-muted rounded" />)}
        </div>
      </div>;
  }
  if (roster.length === 0) return null;

  // Determine which ministries are represented on this date
  const dayOfWeek = date.getDay();
  const isWeekendDay = dayOfWeek === 0 || dayOfWeek === 6;

  // Get unique ministry types from roster (excluding production/video ministry types)
  const bandMinistryTypes = ['weekend', 'encounter', 'eon', 'sunday_am', 'eon_weekend'];
  const productionMinistryTypes = ['production', 'video'];
  const allMinistryTypes = new Set<string>();
  roster.forEach(m => m.ministryTypes.forEach(mt => {
    if (bandMinistryTypes.includes(mt)) {
      allMinistryTypes.add(mt);
    }
  }));

  // Define ministry display order and labels
  const ministryConfig: Record<string, {
    label: string;
    order: number;
  }> = {
    weekend: {
      label: "Weekend",
      order: 0
    },
    eon_weekend: {
      label: "EON Weekend",
      order: 1
    },
    encounter: {
      label: "Encounter",
      order: 2
    },
    eon: {
      label: "EON",
      order: 3
    },
    sunday_am: {
      label: "Weekend Worship",
      order: 4
    }
  };

  // Sort ministries by order
  const sortedMinistries = Array.from(allMinistryTypes).sort((a, b) => {
    const orderA = ministryConfig[a]?.order ?? 99;
    const orderB = ministryConfig[b]?.order ?? 99;
    return orderA - orderB;
  });

  // If a specific ministry filter is applied, show only that ministry
  // If "All Ministries" is selected (no filter), show ALL ministries regardless of day
  // For "weekend_team", show "weekend" ministry (production/video are handled separately)
  const ministriesToShow = isWeekendTeamFilter ? ['weekend'].filter(m => allMinistryTypes.has(m)) : effectiveMinistryFilter ? [effectiveMinistryFilter].filter(m => allMinistryTypes.has(m)) : sortedMinistries;

  // Show grouped view when we have multiple ministries to display
  const showGrouped = !effectiveMinistryFilter && !isWeekendTeamFilter && ministriesToShow.length > 1;

  // Vocal positions to filter by
  const vocalPositions = ['vocalist', 'Vocals', 'Vocalist'];

  // Audio positions (FOH, MON, Audio Shadow, Lighting, ProPresenter, Broadcast)
  const audioPositions = ['sound_tech', 'audio_shadow', 'lighting', 'media', 'foh', 'mon', 'propresenter', 'broadcast', 'Lyrics'];

  // Broadcast positions (cameras, director, producer, etc.)
  const broadcastPositions = ['camera_1', 'camera_2', 'camera_3', 'camera_4', 'camera_5', 'camera_6', 'chat_host', 'director', 'graphics', 'producer', 'switcher'];

  // Get production/video members separately (they serve across all ministries)
  const productionVideoMembers = roster.filter(m => m.ministryTypes.some(mt => productionMinistryTypes.includes(mt)) ||
  // Also include members with production/video positions regardless of ministry type
  m.positions.some(p => [...audioPositions, ...broadcastPositions].some(ap => p.toLowerCase().includes(ap.toLowerCase()) || ap.toLowerCase().includes(p.toLowerCase()))));

  // Helper functions for categorizing members
  const isVocalist = (positions: string[]) => {
    return positions.some(p => vocalPositions.includes(p) || p.toLowerCase().includes('vocal'));
  };
  const isAudio = (positions: string[]) => {
    return positions.some(p => audioPositions.includes(p) || p.toLowerCase().includes('foh') || p.toLowerCase().includes('mon') || p.toLowerCase().includes('audio') || p.toLowerCase().includes('sound') || p.toLowerCase().includes('light') || p.toLowerCase().includes('propresenter') || p.toLowerCase().includes('media') || p.toLowerCase() === 'broadcast');
  };
  const isBroadcast = (positions: string[]) => {
    return positions.some(p => broadcastPositions.includes(p) || p.toLowerCase().includes('camera') || p.toLowerCase().includes('director') || p.toLowerCase().includes('producer') || p.toLowerCase().includes('switcher') || p.toLowerCase().includes('graphics') || p.toLowerCase().includes('chat'));
  };

  // Position priority functions
  const getAudioPositionPriority = (positions: string[]) => {
    for (const pos of positions) {
      const normalized = pos.toLowerCase();
      if (normalized.includes('foh')) return 0;
      if (normalized === 'mon' || normalized.includes('monitor')) return 1;
      if (normalized.includes('light')) return 2;
      if (normalized.includes('propresenter') || normalized.includes('lyrics')) return 3;
      if (normalized.includes('audio') || normalized.includes('sound')) return 4;
      if (normalized.includes('media')) return 5;
    }
    return 99;
  };
  const getBroadcastPositionPriority = (positions: string[]) => {
    for (const pos of positions) {
      const normalized = pos.toLowerCase();
      if (normalized.includes('director')) return 0;
      if (normalized.includes('producer')) return 1;
      if (normalized.includes('switcher')) return 2;
      if (normalized.includes('graphics')) return 3;
      if (normalized.includes('camera')) return 4;
      if (normalized.includes('chat')) return 5;
    }
    return 99;
  };
  const getBandPositionPriority = (positions: string[]) => {
    for (const pos of positions) {
      const normalized = pos.toLowerCase().replace(/\s+/g, '_');
      if (normalized.includes('drum')) return 0;
      if (normalized.includes('bass')) return 1;
      if (normalized === 'acoustic_1' || normalized === 'ag_1' || pos === 'Acoustic 1' || pos === 'AG 1') return 2;
      if (normalized === 'acoustic_2' || normalized === 'ag_2' || pos === 'Acoustic 2' || pos === 'AG 2') return 3;
      if (normalized === 'electric_1' || normalized === 'eg_1' || pos === 'Electric 1' || pos === 'EG 1') return 4;
      if (normalized === 'electric_2' || normalized === 'eg_2' || pos === 'Electric 2' || pos === 'EG 2') return 5;
      if (normalized.includes('key') || normalized.includes('piano')) return 6;
      if (normalized.includes('acoustic')) return 3;
    }
    return 99;
  };

  // Filter members by ministry type
  const getMembersForMinistry = (ministry: string) => {
    return roster.filter(m => m.ministryTypes.includes(ministry));
  };

  // Categorize members within a ministry
  const categorizeMembers = (members: typeof roster) => {
    const vocalists = members.filter(m => isVocalist(m.positions));
    const audioMembers = members.filter(m => !isVocalist(m.positions) && isAudio(m.positions)).sort((a, b) => getAudioPositionPriority(a.positions) - getAudioPositionPriority(b.positions));
    const broadcastMembers = members.filter(m => !isVocalist(m.positions) && !isAudio(m.positions) && isBroadcast(m.positions)).sort((a, b) => getBroadcastPositionPriority(a.positions) - getBroadcastPositionPriority(b.positions));
    const bandMembers = members.filter(m => !isVocalist(m.positions) && !isAudio(m.positions) && !isBroadcast(m.positions)).sort((a, b) => getBandPositionPriority(a.positions) - getBandPositionPriority(b.positions));
    return {
      vocalists,
      audioMembers,
      broadcastMembers,
      bandMembers
    };
  };
  const renderMember = (member: typeof roster[0]) => <div key={member.id} className={`flex items-center gap-2 text-sm rounded-md px-2 py-1.5 -mx-2 ${member.isSwapped ? "bg-green-500/10 border border-green-500/30" : member.hasPendingSwap ? "bg-ecc-yellow/10 border border-ecc-yellow/30" : ""}`}>
      <Avatar className="h-6 w-6">
        <AvatarImage src={member.avatarUrl || undefined} />
        <AvatarFallback className="text-[10px]">
          {member.memberName.split(" ").map(n => n[0]).join("").slice(0, 2)}
        </AvatarFallback>
      </Avatar>
      <span className="text-foreground flex-1 truncate">
        {member.memberName}
        {member.isSwapped && <span className="ml-1.5 inline-flex items-center gap-0.5 text-xs text-green-500" title="Swap confirmed">
            <ArrowRightLeft className="h-3 w-3" />
          </span>}
        {member.hasPendingSwap && !member.isSwapped && <span className="ml-1.5 inline-flex items-center gap-0.5 text-xs text-ecc-yellow" title="Swap pending">
            <ArrowRightLeft className="h-3 w-3" />
          </span>}
      </span>
      <span className="text-muted-foreground text-xs text-right">
        {member.positions.map((p, idx) => {
        // Use position slot for more accurate labeling (eg_1, eg_2, ag_1, ag_2)
        const slot = member.positionSlots?.[idx]?.toLowerCase();

        // For electric guitar, use the slot to determine EG 1 vs EG 2
        if (p === 'electric_guitar' || p === 'electric_1' || p === 'electric_2' || p === 'Electric 1' || p === 'Electric 2') {
          if (slot === 'eg_2') return 'EG 2';
          if (slot === 'eg_1' || !slot) return 'EG 1';
        }
        if (p === 'electric_1' || p === 'Electric 1') return 'EG 1';
        if (p === 'electric_2' || p === 'Electric 2') return 'EG 2';

        // For acoustic guitar, use the slot to determine AG 1 vs AG 2
        if (p === 'acoustic_guitar' || p === 'acoustic_1' || p === 'acoustic_2' || p === 'Acoustic 1' || p === 'Acoustic 2' || p === 'Acoustic Guitar') {
          if (slot === 'ag_2') return 'AG 2';
          if (slot === 'ag_1' || !slot) return 'AG 1';
        }
        if (p === 'Acoustic 2') return 'AG 2';
        if (p === 'vocalist' || p === 'Vocalist' || p === 'Vocals') return 'Vox';
        if (p.toLowerCase() === 'propresenter') return 'Lyrics';
        if (p.toLowerCase() === 'foh') return 'FOH';
        if (p.toLowerCase() === 'mon') return 'MON';
        return POSITION_LABELS[p] || p;
      }).join(", ")}
      </span>
    </div>;

  // Categorize production/video members
  const categorizeProductionVideo = (members: typeof roster) => {
    const audioMembers = members.filter(m => isAudio(m.positions)).sort((a, b) => getAudioPositionPriority(a.positions) - getAudioPositionPriority(b.positions));
    const broadcastMembers = members.filter(m => !isAudio(m.positions) && isBroadcast(m.positions)).sort((a, b) => getBroadcastPositionPriority(a.positions) - getBroadcastPositionPriority(b.positions));
    return {
      audioMembers,
      broadcastMembers
    };
  };
  const renderBandSection = (members: typeof roster, title?: string) => {
    const {
      vocalists,
      bandMembers
    } = categorizeMembers(members);
    if (vocalists.length === 0 && bandMembers.length === 0) {
      return null;
    }
    return <div className="space-y-4">
        {title && <h3 className="text-sm font-semibold text-primary border-b border-border pb-1 mb-3">
            {title}
          </h3>}
        {vocalists.length > 0 && <div>
            <h4 className="text-sm font-medium text-blue-400 mb-2 flex items-center gap-1.5">
              <MicVocal className="h-3.5 w-3.5" />
              Vocalists
            </h4>
            <div className="space-y-1.5">
              {vocalists.map(renderMember)}
            </div>
          </div>}

        {bandMembers.length > 0 && <div>
            <h4 className="text-sm font-medium text-blue-400 mb-2 flex items-center gap-1.5">
              <Guitar className="h-3.5 w-3.5" />
              Band
            </h4>
            <div className="space-y-1.5">
              {bandMembers.map(renderMember)}
            </div>
          </div>}
      </div>;
  };
  const renderProductionVideoSection = () => {
    const {
      audioMembers,
      broadcastMembers
    } = categorizeProductionVideo(productionVideoMembers);
    if (!showAudioVideo) return null;

    // Determine the selected day of week (0 = Sunday, 6 = Saturday)
    const selectedDayOfWeek = date.getDay();
    const isSaturday = selectedDayOfWeek === 6;
    const isSunday = selectedDayOfWeek === 0;

    // Split video/broadcast members by service day
    const saturdayVideoMembers = broadcastMembers.filter(m => m.serviceDay === 'saturday');
    const sundayVideoMembers = broadcastMembers.filter(m => m.serviceDay === 'sunday');
    const noSpecificDayVideoMembers = broadcastMembers.filter(m => !m.serviceDay || m.serviceDay !== 'saturday' && m.serviceDay !== 'sunday');
    const hasSplitDays = saturdayVideoMembers.length > 0 || sundayVideoMembers.length > 0;

    // Filter video members based on selected day
    let filteredVideoMembers: typeof broadcastMembers = [];
    let showDayLabel = false;
    let dayLabel = '';
    if (hasSplitDays && (isSaturday || isSunday)) {
      // Show only the day that matches the selected date
      if (isSaturday) {
        filteredVideoMembers = [...saturdayVideoMembers, ...noSpecificDayVideoMembers];
        dayLabel = 'Saturday';
      } else {
        filteredVideoMembers = [...sundayVideoMembers, ...noSpecificDayVideoMembers];
        dayLabel = 'Sunday';
      }
      showDayLabel = true;
    } else {
      // Not a weekend day or no split days - show all
      filteredVideoMembers = broadcastMembers;
    }
    return <div className="space-y-4">
        <div>
          <h4 className="text-sm font-medium text-blue-400 mb-2 flex items-center gap-1.5">
            <Volume2 className="h-3.5 w-3.5" />
            Production
          </h4>
          {audioMembers.length > 0 ? <div className="space-y-1.5">
              {audioMembers.map(renderMember)}
            </div> : <p className="text-xs text-muted-foreground italic">No production members assigned</p>}
        </div>

        <div>
          <h4 className="text-sm font-medium text-blue-400 mb-2 flex items-center gap-1.5">
            <Video className="h-3.5 w-3.5" />
            Video
            {showDayLabel && <span className="text-xs text-muted-foreground font-normal ml-1">({dayLabel})</span>}
          </h4>
          {filteredVideoMembers.length > 0 ? <div className="space-y-1.5">
              {filteredVideoMembers.map(renderMember)}
            </div> : <p className="text-xs text-muted-foreground italic">No video members assigned</p>}
        </div>
      </div>;
  };

  // Render grouped by ministry or flat if only one ministry
  if (showGrouped && ministriesToShow.length > 1) {
    return <div className="mb-4 space-y-6">
        <div className={`grid grid-cols-1 ${showAudioVideo ? 'md:grid-cols-2' : ''} gap-6`}>
          {/* Left Column: Vocalists + Band by Ministry */}
          <div className="space-y-6">
            {ministriesToShow.map(ministry => {
            const members = getMembersForMinistry(ministry);
            if (members.length === 0) return null;
            const label = ministryConfig[ministry]?.label || ministry;
            return <div key={ministry}>
                  {renderBandSection(members, label)}
                </div>;
          })}
          </div>
          
          {/* Right Column: Production + Video */}
          {renderProductionVideoSection()}
        </div>
      </div>;
  }

  // Single ministry filter applied, single ministry found, or no grouping - show flat
  // When a ministry filter is applied, we just show all roster members (already filtered by hook)
  const membersToShow = effectiveMinistryFilter ? roster.filter(m => !productionVideoMembers.includes(m)) // Already filtered by hook
  : showGrouped && ministriesToShow.length === 1 ? getMembersForMinistry(ministriesToShow[0]) : roster.filter(m => !productionVideoMembers.includes(m)); // Exclude production/video from band list

  return <div className="mb-4">
      <div className={`grid grid-cols-1 ${showAudioVideo ? 'md:grid-cols-2' : ''} gap-6`}>
        {/* Left Column: Vocalists + Band */}
        <div>
          {renderBandSection(membersToShow)}
        </div>
        
        {/* Right Column: Production + Video */}
        {renderProductionVideoSection()}
      </div>
    </div>;
}

// Songs Preview Component
function SongsPreview({
  date,
  campusId,
  ministryFilter
}: {
  date: Date;
  campusId?: string;
  ministryFilter?: string;
}) {
  const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const {
    data: plansWithSongs = [],
    isLoading
  } = useSongsForDate(dateStr, campusId, ministryFilter);

  // Build service flow link with query params
  const serviceFlowLink = `/service-flow?date=${dateStr}${campusId ? `&campus=${campusId}` : ""}${ministryFilter ? `&ministry=${ministryFilter}` : ""}`;
  if (isLoading) {
    return <div className="mb-4">
        <div className="animate-pulse space-y-2">
          {[1, 2].map(i => <div key={i} className="h-6 bg-muted rounded" />)}
        </div>
      </div>;
  }
  if (plansWithSongs.length === 0) return null;
  const allSongs = plansWithSongs.flatMap(p => p.songs || []);
  if (allSongs.length === 0) return null;
  return <div className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-blue-400 flex items-center gap-1.5">
          <Music className="h-3.5 w-3.5" />
          Songs
        </h3>
        <div className="flex items-center gap-2">
          <Link to={serviceFlowLink} className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-red-600 text-white hover:bg-red-700 transition-colors">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-300 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-200"></span>
            </span>
            LIVE
          </Link>
          
        </div>
      </div>
      <div className="space-y-1.5">
        {allSongs.slice(0, 6).map((song, index) => <div key={`${song.id}-${index}`} className="flex items-center justify-between text-sm py-1">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <span className="text-foreground truncate">{song.title}</span>
              {song.isFirstUse && <Badge className="bg-ecc-teal text-white text-[10px] px-1.5 py-0 h-4 shrink-0">
                  NEW
                </Badge>}
            </div>
            <div className="flex items-center gap-2 shrink-0 ml-2">
              {song.vocalist?.name && <span className="text-xs text-primary/70">
                  {song.vocalist.name.split(' ')[0]}
                </span>}
              {song.key && <Badge variant="outline" className="text-xs">
                  {song.key}
                </Badge>}
            </div>
          </div>)}
        {allSongs.length > 6 && <p className="text-xs text-muted-foreground pt-1">
            +{allSongs.length - 6} more songs
          </p>}
      </div>
    </div>;
}

function CustomServiceSongsPreview({
  customServiceId,
  planDate,
  campusId,
  ministryType,
}: {
  customServiceId: string;
  planDate: string;
  campusId: string;
  ministryType: string;
}) {
  const { data: existingSet, isLoading: isSetLoading } = useExistingSet(campusId, ministryType, planDate, customServiceId);
  const { data: draftSongs = [], isLoading: isSongsLoading } = useDraftSetSongs(existingSet?.id || null);

  if (isSetLoading || isSongsLoading) {
    return <div className="mb-4">
        <div className="animate-pulse space-y-2">
          {[1, 2].map(i => <div key={i} className="h-6 bg-muted rounded" />)}
        </div>
      </div>;
  }

  if (!existingSet || draftSongs.length === 0) {
    return <div className="mb-4 rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
        No setlist has been saved for this custom service yet.
      </div>;
  }

  return <div className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-blue-400 flex items-center gap-1.5">
          <Music className="h-3.5 w-3.5" />
          Song Set
        </h3>
        <Badge variant="outline" className="text-xs capitalize">{existingSet.status}</Badge>
      </div>
      <div className="space-y-1.5">
        {draftSongs.map((song, index) => <div key={song.id} className="flex items-center justify-between text-sm py-1">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <span className="text-xs text-muted-foreground w-5">{index + 1}.</span>
              <span className="text-foreground truncate">{song.song?.title || "Untitled Song"}</span>
            </div>
            {song.song_key && <Badge variant="outline" className="text-xs">{song.song_key}</Badge>}
          </div>)}
      </div>
    </div>;
}

function CustomServiceRoster({
  customServiceId,
  assignmentDate,
}: {
  customServiceId: string;
  assignmentDate: string;
}) {
  const { data: assignments = [], isLoading } = useCustomServiceAssignments(customServiceId, assignmentDate);

  if (isLoading) {
    return <div className="mb-4">
        <div className="animate-pulse space-y-2">
          {[1, 2, 3].map(i => <div key={i} className="h-8 bg-muted rounded" />)}
        </div>
      </div>;
  }

  if (assignments.length === 0) {
    return <div className="mb-4 rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
        No team members assigned to this custom service yet.
      </div>;
  }

  const grouped = Array.from(assignments.reduce((map, assignment) => {
    const existing = map.get(assignment.user_id) || {
      userId: assignment.user_id,
      name: assignment.profiles?.full_name || "Team Member",
      avatarUrl: assignment.profiles?.avatar_url || null,
      roles: new Set<string>(),
    };
    existing.roles.add(assignment.role);
    map.set(assignment.user_id, existing);
    return map;
  }, new Map<string, {
    userId: string;
    name: string;
    avatarUrl: string | null;
    roles: Set<string>;
  }>()).values()).sort((a, b) => a.name.localeCompare(b.name));

  return <div className="mb-4">
      <h3 className="text-sm font-medium text-blue-400 flex items-center gap-1.5 mb-2">
        <MicVocal className="h-3.5 w-3.5" />
        Team Roster
      </h3>
      <div className="space-y-1.5">
        {grouped.map((member) => <div key={member.userId} className="flex items-center gap-2 rounded-md px-2 py-1.5 -mx-2">
            <Avatar className="h-6 w-6">
              <AvatarImage src={member.avatarUrl || undefined} />
              <AvatarFallback className="text-[10px]">
                {member.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
              </AvatarFallback>
            </Avatar>
            <span className="text-foreground flex-1 truncate">{member.name}</span>
            <div className="flex flex-wrap gap-1 justify-end">
              {Array.from(member.roles).sort().map((role) => <Badge key={`${member.userId}-${role}`} variant="outline" className="text-xs">
                  {POSITION_LABELS[role] || role}
                </Badge>)}
            </div>
          </div>)}
      </div>
    </div>;
}
