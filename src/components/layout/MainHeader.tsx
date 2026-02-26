import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useUserRoles } from "@/hooks/useUserRoles";
import { useProfile } from "@/hooks/useProfiles";
import { useCampuses, useUserCampuses } from "@/hooks/useCampuses";
import { useIsApprover, usePendingApprovalCount } from "@/hooks/useSetlistApprovals";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Users, Settings, LogOut, LayoutDashboard, FolderOpen, ClipboardList, Link2, ChevronDown, FileCheck, Home, Music } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import emLogo from "@/assets/em-logo-transparent-new.png";
import { NotificationBell } from "./NotificationBell";
import { HeaderMiniPlayer } from "@/components/audio/HeaderMiniPlayer";
import { useMemo, useEffect, useState } from "react";
import { useCampusSelectionOptional } from "./CampusSelectionContext";
import { isAuditionCandidateRole } from "@/lib/access";

interface MainHeaderProps {
  selectedCampusId?: string | null;
  onSelectCampus?: (campusId: string) => void;
}
export function MainHeader({
  selectedCampusId: selectedCampusIdProp,
  onSelectCampus: onSelectCampusProp
}: MainHeaderProps) {
  const {
    user,
    signOut,
    canManageTeam,
    canSwitchCampusChat,
    isLeader
  } = useAuth();
  const location = useLocation();
  const { data: roles = [] } = useUserRoles(user?.id);
  const isAuditionCandidate = isAuditionCandidateRole(roles.map((r) => r.role));
  const {
    data: profile
  } = useProfile(user?.id);
  const {
    data: userCampuses
  } = useUserCampuses(user?.id);
  const {
    data: allCampuses
  } = useCampuses();
  const {
    data: isApprover
  } = useIsApprover();
  const {
    data: pendingApprovalCount
  } = usePendingApprovalCount();
  const campusCtx = useCampusSelectionOptional();
  const selectedCampusId = selectedCampusIdProp ?? campusCtx?.selectedCampusId;
  const onSelectCampus = onSelectCampusProp ?? campusCtx?.setSelectedCampusId;
  const isOnChatPage = location.pathname === "/chat";

  // Admins see all campuses, others see only their assigned campuses
  const availableCampuses = useMemo(() => {
    if (isLeader && allCampuses) {
      return allCampuses.map(c => ({
        campus_id: c.id,
        campuses: c
      }));
    }
    return userCampuses || [];
  }, [isLeader, allCampuses, userCampuses]);
  const selectedCampus = useMemo(() => availableCampuses.find(uc => uc.campus_id === selectedCampusId), [availableCampuses, selectedCampusId]);

  // Don't show campus selector in MainHeader for chat page - ChatHeader handles it
  const showCampusSelector = false;

  // Get initials from full name
  const getInitials = () => {
    if (profile?.full_name) {
      const nameParts = profile.full_name.trim().split(/\s+/);
      if (nameParts.length >= 2) {
        return (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase();
      }
      return nameParts[0].substring(0, 2).toUpperCase();
    }
    return user?.email?.substring(0, 2).toUpperCase() || "?";
  };
  const initials = getInitials();
  return <header className="sticky top-0 z-50 border-b border-border bg-card/95 backdrop-blur-sm" style={{
    paddingTop: 'env(safe-area-inset-top, 0px)'
  }}>
      <div className="container flex h-14 items-center justify-between px-4 relative">
        {/* Left side - Home button (on chat), Logo and Campus selector */}
        <div className="flex items-center gap-3">
          {isOnChatPage && <Link to="/">
              <Button variant="ghost" size="icon" className="h-9 w-9">
                <Home className="h-5 w-5" />
              </Button>
            </Link>}
          <Link to="/dashboard">
            
          </Link>
          {showCampusSelector && <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center gap-2 text-foreground hover:text-foreground/80 transition-colors">
                <span className="text-lg font-semibold">
                  {selectedCampus?.campuses?.name || "Select Campus"}
                </span>
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56 bg-popover">
                {availableCampuses.map(uc => <DropdownMenuItem key={uc.campus_id} onClick={() => onSelectCampus(uc.campus_id)} className={cn(selectedCampusId === uc.campus_id && "bg-accent")}>
                    {uc.campuses?.name}
                  </DropdownMenuItem>)}
              </DropdownMenuContent>
            </DropdownMenu>}
        </div>

        {/* Center - Mini Player (absolutely centered) */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <HeaderMiniPlayer />
        </div>

        {/* Right side - Notification bell and User menu */}
        <div className="flex items-center gap-2">
          {/* Notification bell */}
          {!isAuditionCandidate && <NotificationBell />}
          
          {/* User menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-primary hover:opacity-90 transition-opacity">
                <span className="text-sm font-bold text-primary-foreground">{initials}</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 bg-popover">
              {!isAuditionCandidate && (
                <DropdownMenuItem asChild>
                  <Link to="/dashboard" className="flex items-center gap-2">
                    <LayoutDashboard className="h-4 w-4" />
                    Dashboard
                  </Link>
                </DropdownMenuItem>
              )}
              {!isAuditionCandidate && (
                <DropdownMenuItem asChild>
                  <Link to="/team" className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Team Directory
                  </Link>
                </DropdownMenuItem>
              )}
              {!isAuditionCandidate && (
                <DropdownMenuItem asChild>
                  <Link to="/schedule" className="flex items-center gap-2">
                    <ClipboardList className="h-4 w-4" />
                    My Schedule
                  </Link>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem asChild>
                <Link to="/songs" className="flex items-center gap-2">
                  <FolderOpen className="h-4 w-4" />
                  Song Library
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/resources" className="flex items-center gap-2">
                  <Music className="h-4 w-4" />
                  Audio Library
                </Link>
              </DropdownMenuItem>
              {!isAuditionCandidate && isApprover && <DropdownMenuItem asChild>
                  <Link to="/approvals" className="flex items-center gap-2">
                    <FileCheck className="h-4 w-4" />
                    Approvals
                    {(pendingApprovalCount ?? 0) > 0 && <Badge variant="destructive" className="ml-auto h-5 min-w-5 px-1.5 text-xs">
                        {pendingApprovalCount}
                      </Badge>}
                  </Link>
                </DropdownMenuItem>}
              {!isAuditionCandidate && <DropdownMenuItem asChild>
                  <Link to="/settings/planning-center" className="flex items-center gap-2">
                    <Link2 className="h-4 w-4" />
                    Integrations
                  </Link>
                </DropdownMenuItem>}
              {!isAuditionCandidate && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link to="/profile" className="flex items-center gap-2">
                      <Settings className="h-4 w-4" />
                      My Profile
                    </Link>
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={signOut} className="text-destructive">
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>;
}
