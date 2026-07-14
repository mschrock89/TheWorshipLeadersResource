import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useUserRoles } from "@/hooks/useUserRoles";
import { useProfile } from "@/hooks/useProfiles";
import { useIsApprover, usePendingApprovalCount } from "@/hooks/useSetlistApprovals";
import { useDrumTechAccess } from "@/hooks/useDrumTech";
import { usePendingSwapRequestsCount } from "@/hooks/useSwapRequests";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Users, Settings, LogOut, LayoutDashboard, FolderOpen, ClipboardList, Link2, FileCheck, Home, Music, Gamepad2, Newspaper, Wrench, ArrowLeftRight, BookOpen, ListMusic, MapPinned } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NotificationBell } from "./NotificationBell";
import { HeaderMiniPlayer } from "@/components/audio/HeaderMiniPlayer";
import { isAuditionCandidateRole, isStudentBaseRole } from "@/lib/access";
import { isCurrentStudentResourceApp } from "@/lib/resourceApp";

export function MainHeader() {
  const {
    user,
    signOut
  } = useAuth();
  const location = useLocation();
  const { data: roles = [] } = useUserRoles(user?.id);
  const isAuditionCandidate = isAuditionCandidateRole(roles.map((r) => r.role));
  const isStudentBase = isStudentBaseRole(roles.map((r) => r.role));
  const {
    data: profile
  } = useProfile(user?.id);
  const {
    data: isApprover
  } = useIsApprover();
  const {
    data: pendingApprovalCount
  } = usePendingApprovalCount();
  const {
    data: pendingSwaps = 0
  } = usePendingSwapRequestsCount();
  const drumTechAccess = useDrumTechAccess();
  const isStudentApp = isCurrentStudentResourceApp();
  const isOnChatPage = location.pathname === "/chat";

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
        {/* Left side - Home button (on chat) */}
        <div className="flex items-center gap-3">
          {isOnChatPage && <Link to="/">
              <Button variant="ghost" size="icon" className="h-9 w-9">
                <Home className="h-5 w-5" />
              </Button>
            </Link>}
        </div>

        {/* Center - Mini Player (absolutely centered) */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <HeaderMiniPlayer />
        </div>

        {/* Right side - Notification bell and User menu */}
        <div className="flex items-center gap-2">
          {/* Notification bell */}
          {!isAuditionCandidate && !isStudentBase && <NotificationBell />}
          
          {/* User menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-primary hover:opacity-90 transition-opacity">
                <span className="text-sm font-bold text-primary-foreground">{initials}</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 bg-popover">
              {!isAuditionCandidate && !isStudentBase && (
                <DropdownMenuItem asChild>
                  <Link to="/dashboard" className="flex items-center gap-2">
                    <LayoutDashboard className="h-4 w-4" />
                    Dashboard
                  </Link>
                </DropdownMenuItem>
              )}
              {!isAuditionCandidate && !isStudentBase && (
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
              {!isAuditionCandidate && !isStudentBase && (
                <DropdownMenuItem asChild>
                  <Link to="/swaps" className="flex items-center gap-2">
                    <ArrowLeftRight className="h-4 w-4" />
                    Swaps
                    {pendingSwaps > 0 && <Badge variant="destructive" className="ml-auto h-5 min-w-5 px-1.5 text-xs">
                        {pendingSwaps > 99 ? "99+" : pendingSwaps}
                      </Badge>}
                  </Link>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem asChild>
                <Link to="/feed" className="flex items-center gap-2">
                  <Newspaper className="h-4 w-4" />
                  THE FEED
                </Link>
              </DropdownMenuItem>
              {!isAuditionCandidate && isStudentApp && (
                <DropdownMenuItem asChild>
                  <Link to="/attendance" className="flex items-center gap-2">
                    <MapPinned className="h-4 w-4" />
                    Attendance
                  </Link>
                </DropdownMenuItem>
              )}
              {isStudentBase && (
                <DropdownMenuItem asChild>
                  <Link to="/bible" className="flex items-center gap-2">
                    <BookOpen className="h-4 w-4" />
                    Bible
                  </Link>
                </DropdownMenuItem>
              )}
              {!isStudentApp && (
                <DropdownMenuItem asChild>
                  <Link to="/songs" className="flex items-center gap-2">
                    <FolderOpen className="h-4 w-4" />
                    Song Library
                  </Link>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem asChild>
                <Link to="/resources" className="flex items-center gap-2">
                  <Music className="h-4 w-4" />
                  Audio Library
                </Link>
              </DropdownMenuItem>
              {isStudentBase && (
                <DropdownMenuItem asChild>
                  <Link to="/my-setlists" className="flex items-center gap-2">
                    <ListMusic className="h-4 w-4" />
                    {isStudentApp ? "My Setlists" : "Setlists"}
                  </Link>
                </DropdownMenuItem>
              )}
              {!isStudentApp && !isAuditionCandidate && !isStudentBase && drumTechAccess.hasAnyAccess && (
                <DropdownMenuItem asChild>
                  <Link to="/drum-tech" className="flex items-center gap-2">
                    <Wrench className="h-4 w-4" />
                    Drum Tech
                  </Link>
                </DropdownMenuItem>
              )}
              {!isAuditionCandidate && !isStudentBase && (
                <DropdownMenuItem asChild>
                  <Link to="/games" className="flex items-center gap-2">
                    <Gamepad2 className="h-4 w-4" />
                    Games
                  </Link>
                </DropdownMenuItem>
              )}
              {!isAuditionCandidate && !isStudentBase && isApprover && <DropdownMenuItem asChild>
                  <Link to="/approvals" className="flex items-center gap-2">
                    <FileCheck className="h-4 w-4" />
                    Approvals
                    {(pendingApprovalCount ?? 0) > 0 && <Badge variant="destructive" className="ml-auto h-5 min-w-5 px-1.5 text-xs">
                        {pendingApprovalCount}
                      </Badge>}
                  </Link>
                </DropdownMenuItem>}
              {!isAuditionCandidate && !isStudentBase && <DropdownMenuItem asChild>
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
