import { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfiles";
import { useAudioPlayerSafe } from "@/hooks/useAudioPlayer";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Home, Users, Settings, LogOut, LayoutDashboard, FolderOpen, Calendar, Link2, ClipboardList, Music } from "lucide-react";
import { TeamBadge } from "./TeamBadge";
import { NotificationBell } from "./NotificationBell";
import { cn } from "@/lib/utils";
interface AppLayoutProps {
  children: ReactNode;
}
export function AppLayout({
  children
}: AppLayoutProps) {
  const {
    user,
    signOut,
    isLeader,
    canManageTeam
  } = useAuth();
  const location = useLocation();
  const {
    data: profile
  } = useProfile(user?.id);
  
  // Check if audio player is active to add extra padding
  const audioPlayer = useAudioPlayerSafe();
  const hasActivePlayer = !!audioPlayer?.currentTrack;
  
  const navigation = [{
    name: "Dashboard",
    href: "/dashboard",
    icon: Home
  }];

  // Get initials from full name (first letter of first name + first letter of last name)
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
  return <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-card/80 backdrop-blur-sm">
        <div className="container flex h-16 items-center px-4">
          <div className="flex items-center gap-4">
            {/* Notifications */}
            <NotificationBell />
            
            {/* Logo */}
            <Link to="/" className="flex items-center gap-2">
              
              
            </Link>

            {/* Desktop nav */}
            <nav className="hidden md:flex md:gap-1">
              {navigation.map(item => <Link key={item.name} to={item.href}>
                  <Button variant={location.pathname === item.href ? "secondary" : "ghost"} className={cn("gap-2", location.pathname === item.href && "bg-secondary text-secondary-foreground")}>
                    <item.icon className={cn("h-4 w-4", item.name === "Dashboard" && "text-accent")} />
                    {item.name}
                  </Button>
                </Link>)}
            </nav>
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Team badge */}
          <div className="mr-3">
            <TeamBadge />
          </div>

          {/* User menu */}
          <div className="flex items-center gap-3">
            <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-primary hover:opacity-90 transition-opacity">
                <span className="text-sm font-bold text-primary-foreground">{initials}</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem asChild>
                <Link to="/dashboard" className="flex items-center gap-2">
                  <LayoutDashboard className="h-4 w-4" />
                  Dashboard
                </Link>
              </DropdownMenuItem>
              {canManageTeam && <DropdownMenuItem asChild>
                  <Link to="/team" className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Team Directory
                  </Link>
                </DropdownMenuItem>}
              <DropdownMenuItem asChild>
                <Link to="/schedule" className="flex items-center gap-2">
                  <ClipboardList className="h-4 w-4" />
                  My Schedule
                </Link>
              </DropdownMenuItem>
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
              {canManageTeam && <DropdownMenuItem asChild>
                  <Link to="/settings/planning-center" className="flex items-center gap-2">
                    <Link2 className="h-4 w-4" />
                    Integrations
                  </Link>
                </DropdownMenuItem>}
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to="/profile" className="flex items-center gap-2">
                  <Settings className="h-4 w-4" />
                  My Profile
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={signOut} className="text-destructive">
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          </div>
        </div>

      </header>

      {/* Main content */}
      <main className={`container px-4 py-6 ${hasActivePlayer ? "pb-36" : "pb-24"}`}>{children}</main>
    </div>;
}
