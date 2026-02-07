import { Link } from "react-router-dom";
import { useLeadershipRoles } from "@/hooks/useLeadershipRoles";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Shield } from "lucide-react";

function getInitials(name: string | null): string {
  if (!name) return "?";
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

interface ConsolidatedUser {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  roles: string[];
  campuses: string[];
}

function getRoleBadgeLabel(role: string): string {
  switch (role) {
    case "admin": return "Org Admin";
    case "campus_admin": return "Campus Admin";
    case "network_worship_pastor": return "Network Pastor";
    case "campus_worship_pastor": return "Worship Pastor";
    case "student_worship_pastor": return "Student Leader";
    default: return role;
  }
}

function getRoleBadgeVariant(role: string): "default" | "secondary" | "outline" {
  switch (role) {
    case "admin": return "default";
    case "campus_admin": return "secondary";
    case "network_worship_pastor": return "secondary";
    default: return "outline";
  }
}

interface UserRowProps {
  user: ConsolidatedUser;
}

function UserRow({ user }: UserRowProps) {
  return (
    <Link
      to={`/team/${user.id}`}
      className="flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-muted/50"
    >
      <Avatar className="h-9 w-9">
        <AvatarImage src={user.avatar_url || undefined} alt={user.full_name || "User"} />
        <AvatarFallback className="bg-primary/10 text-xs text-primary">
          {getInitials(user.full_name)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{user.full_name || "Unknown"}</p>
        <div className="flex flex-wrap gap-1 mt-0.5">
          {user.roles.map((role) => (
            <Badge
              key={role}
              variant={getRoleBadgeVariant(role)}
              className="h-4 px-1.5 text-[10px] font-medium"
            >
              {getRoleBadgeLabel(role)}
            </Badge>
          ))}
          {user.campuses.length > 0 && (
            <span className="text-[10px] text-muted-foreground">
              · {user.campuses.join(", ")}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

interface LeadershipRolesWidgetProps {
  selectedCampusId?: string;
}

export function LeadershipRolesWidget({ selectedCampusId = "all" }: LeadershipRolesWidgetProps) {
  const { data, isLoading } = useLeadershipRoles();

  // Consolidate users - each person appears once with all their roles
  const consolidatedUsers: ConsolidatedUser[] = [];
  
  if (data) {
    const userMap = new Map<string, ConsolidatedUser>();
    
    // Add all roles to the map
    const addUser = (user: { id: string; full_name: string | null; avatar_url: string | null; role: string; campus_name: string | null; campus_id: string | null }) => {
      // Filter by campus if selected (except org admins who are always shown)
      if (selectedCampusId !== "all" && user.role !== "admin" && user.campus_id !== selectedCampusId) {
        return;
      }
      
      if (userMap.has(user.id)) {
        const existing = userMap.get(user.id)!;
        if (!existing.roles.includes(user.role)) {
          existing.roles.push(user.role);
        }
        if (user.campus_name && !existing.campuses.includes(user.campus_name)) {
          existing.campuses.push(user.campus_name);
        }
      } else {
        userMap.set(user.id, {
          id: user.id,
          full_name: user.full_name,
          avatar_url: user.avatar_url,
          roles: [user.role],
          campuses: user.campus_name ? [user.campus_name] : [],
        });
      }
    };
    
    data.admins.forEach(addUser);
    data.campusAdmins.forEach(addUser);
    data.networkWorshipPastors.forEach(addUser);
    data.worshipPastors.forEach(addUser);
    
    // Sort by highest role priority, then by name
    const rolePriority: Record<string, number> = {
      admin: 0,
      campus_admin: 1,
      network_worship_pastor: 2,
      campus_worship_pastor: 3,
      student_worship_pastor: 4,
    };
    
    consolidatedUsers.push(...Array.from(userMap.values()).sort((a, b) => {
      const aPriority = Math.min(...a.roles.map(r => rolePriority[r] ?? 99));
      const bPriority = Math.min(...b.roles.map(r => rolePriority[r] ?? 99));
      if (aPriority !== bPriority) return aPriority - bPriority;
      return (a.full_name || "").localeCompare(b.full_name || "");
    }));
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Shield className="h-5 w-5 text-primary" />
            Leadership
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (consolidatedUsers.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Shield className="h-5 w-5 text-primary" />
            Leadership
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-center text-sm text-muted-foreground">
            {selectedCampusId === "all" 
              ? "No leadership roles assigned yet." 
              : "No leadership for this campus."}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Shield className="h-5 w-5 text-primary" />
          Leadership
          <Badge variant="secondary" className="ml-auto h-5 px-1.5 text-xs">
            {consolidatedUsers.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-0.5">
        {consolidatedUsers.map((user) => (
          <UserRow key={user.id} user={user} />
        ))}
      </CardContent>
    </Card>
  );
}
