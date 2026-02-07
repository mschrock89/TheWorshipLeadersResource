import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useCampuses, Campus, useUpdateCampusServiceConfig } from "@/hooks/useCampuses";
import { useLeadershipRoles } from "@/hooks/useLeadershipRoles";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Settings, Check, X, Plus, Minus, ArrowLeft, Shield, KeyRound, Loader2, ListOrdered } from "lucide-react";
import { TemplateManager } from "@/components/service-flow/TemplateManager";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

function getInitials(name: string | null): string {
  if (!name) return "?";
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
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

function formatTime(timeString: string): string {
  if (!timeString) return "-";
  const [hours, minutes] = timeString.split(":");
  const hour = parseInt(hours, 10);
  const ampm = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minutes} ${ampm}`;
}

function formatTimes(times: string[] | null): string {
  if (!times || times.length === 0) return "-";
  return times.map(t => formatTime(t)).join(", ");
}

interface CampusServiceConfig {
  id: string;
  name: string;
  has_saturday_service: boolean;
  has_sunday_service: boolean;
  saturday_service_times: string[];
  sunday_service_times: string[];
}

export default function AdminTools() {
  const navigate = useNavigate();
  const { isAdmin, isLoading: authLoading } = useAuth();
  const { data: campuses = [], isLoading: campusesLoading } = useCampuses();
  const { data: leadershipData, isLoading: leadershipLoading } = useLeadershipRoles();
  const updateConfig = useUpdateCampusServiceConfig();

  // Consolidate leadership users
  const consolidatedUsers = (() => {
    if (!leadershipData) return [];
    
    const userMap = new Map<string, {
      id: string;
      full_name: string | null;
      avatar_url: string | null;
      roles: string[];
      campuses: string[];
    }>();
    
    const addUser = (user: { id: string; full_name: string | null; avatar_url: string | null; role: string; campus_name: string | null }) => {
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
    
    leadershipData.admins.forEach(addUser);
    leadershipData.campusAdmins.forEach(addUser);
    leadershipData.networkWorshipPastors.forEach(addUser);
    leadershipData.worshipPastors.forEach(addUser);
    
    const rolePriority: Record<string, number> = {
      admin: 0,
      campus_admin: 1,
      network_worship_pastor: 2,
      campus_worship_pastor: 3,
      student_worship_pastor: 4,
    };
    
    return Array.from(userMap.values()).sort((a, b) => {
      const aPriority = Math.min(...a.roles.map(r => rolePriority[r] ?? 99));
      const bPriority = Math.min(...b.roles.map(r => rolePriority[r] ?? 99));
      if (aPriority !== bPriority) return aPriority - bPriority;
      return (a.full_name || "").localeCompare(b.full_name || "");
    });
  })();
  
  const [isEditing, setIsEditing] = useState(false);
  const [isResettingPasswords, setIsResettingPasswords] = useState(false);
  const [resetResults, setResetResults] = useState<{ successCount: number; skippedCount: number; failCount: number } | null>(null);

  const handleMasterPasswordReset = async () => {
    setIsResettingPasswords(true);
    setResetResults(null);
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await supabase.functions.invoke('reset-all-passwords', {
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
        },
      });

      if (response.error) {
        throw new Error(response.error.message || 'Failed to reset passwords');
      }

      const { successCount, skippedCount, failCount } = response.data;
      setResetResults({ successCount, skippedCount, failCount });
      
      if (failCount === 0) {
        toast.success(`Passwords reset successfully`, {
          description: `${successCount} reset, ${skippedCount} skipped (already logged in)`,
        });
      } else {
        toast.warning(`Password reset completed with errors`, {
          description: `${successCount} reset, ${skippedCount} skipped, ${failCount} failed`,
        });
      }
    } catch (error) {
      console.error('Password reset error:', error);
      toast.error('Failed to reset passwords', {
        description: error instanceof Error ? error.message : 'An unexpected error occurred',
      });
    } finally {
      setIsResettingPasswords(false);
    }
  };
  const [configs, setConfigs] = useState<CampusServiceConfig[]>([]);

  // Redirect non-admins
  useEffect(() => {
    if (!authLoading && !isAdmin) {
      navigate("/dashboard");
    }
  }, [authLoading, isAdmin, navigate]);

  // Initialize configs when campuses load
  useEffect(() => {
    if (campuses.length > 0 && !isEditing) {
      setConfigs(
        campuses.map((campus) => ({
          id: campus.id,
          name: campus.name,
          has_saturday_service: campus.has_saturday_service ?? false,
          has_sunday_service: campus.has_sunday_service ?? true,
          saturday_service_times: campus.saturday_service_time?.map(t => t.slice(0, 5)) || ["17:00"],
          sunday_service_times: campus.sunday_service_time?.map(t => t.slice(0, 5)) || ["10:00"],
        }))
      );
    }
  }, [campuses, isEditing]);

  const toggleService = (campusId: string, field: "has_saturday_service" | "has_sunday_service") => {
    setConfigs((prev) =>
      prev.map((c) => {
        if (c.id !== campusId) return c;
        const newValue = !c[field];
        if (newValue) {
          if (field === "has_saturday_service" && c.saturday_service_times.length === 0) {
            return { ...c, [field]: newValue, saturday_service_times: ["17:00"] };
          }
          if (field === "has_sunday_service" && c.sunday_service_times.length === 0) {
            return { ...c, [field]: newValue, sunday_service_times: ["10:00"] };
          }
        }
        return { ...c, [field]: newValue };
      })
    );
  };

  const addServiceTime = (campusId: string, day: "saturday" | "sunday") => {
    setConfigs((prev) =>
      prev.map((c) => {
        if (c.id !== campusId) return c;
        const field = day === "saturday" ? "saturday_service_times" : "sunday_service_times";
        const defaultTime = day === "saturday" ? "18:00" : "11:30";
        return { ...c, [field]: [...c[field], defaultTime] };
      })
    );
  };

  const removeServiceTime = (campusId: string, day: "saturday" | "sunday", index: number) => {
    setConfigs((prev) =>
      prev.map((c) => {
        if (c.id !== campusId) return c;
        const field = day === "saturday" ? "saturday_service_times" : "sunday_service_times";
        const newTimes = c[field].filter((_, i) => i !== index);
        return { ...c, [field]: newTimes };
      })
    );
  };

  const handleTimeChange = (campusId: string, day: "saturday" | "sunday", index: number, value: string) => {
    setConfigs((prev) =>
      prev.map((c) => {
        if (c.id !== campusId) return c;
        const field = day === "saturday" ? "saturday_service_times" : "sunday_service_times";
        const newTimes = [...c[field]];
        newTimes[index] = value;
        return { ...c, [field]: newTimes };
      })
    );
  };

  const handleSave = async () => {
    await updateConfig.mutateAsync(
      configs.map((c) => ({
        id: c.id,
        has_saturday_service: c.has_saturday_service,
        has_sunday_service: c.has_sunday_service,
        saturday_service_time: c.saturday_service_times,
        sunday_service_time: c.sunday_service_times,
      }))
    );
    setIsEditing(false);
  };

  const handleCancel = () => {
    setIsEditing(false);
    // Reset configs from campuses
    setConfigs(
      campuses.map((campus) => ({
        id: campus.id,
        name: campus.name,
        has_saturday_service: campus.has_saturday_service ?? false,
        has_sunday_service: campus.has_sunday_service ?? true,
        saturday_service_times: campus.saturday_service_time?.map(t => t.slice(0, 5)) || ["17:00"],
        sunday_service_times: campus.sunday_service_time?.map(t => t.slice(0, 5)) || ["10:00"],
      }))
    );
  };

  if (authLoading) {
    return (
      <div className="container max-w-4xl py-8">
        <Skeleton className="h-8 w-48 mb-8" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!isAdmin) return null;

  return (
    <div className="container max-w-4xl py-8">
      {/* Header */}
      <div className="mb-8">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/dashboard")}
          className="mb-4 -ml-2 gap-2 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Button>
        <h1 className="font-display text-3xl font-bold text-foreground">Admin Tools</h1>
        <p className="mt-2 text-muted-foreground">
          Manage organization-wide settings and configurations
        </p>
      </div>

      {/* Leadership Section */}
      <Card className="mb-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-xl font-semibold flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Leadership
            {consolidatedUsers.length > 0 && (
              <Badge variant="secondary" className="ml-auto h-5 px-1.5 text-xs">
                {consolidatedUsers.length}
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            Organization leaders and their roles
          </CardDescription>
        </CardHeader>
        <CardContent>
          {leadershipLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : consolidatedUsers.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-4">
              No leadership roles assigned yet.
            </p>
          ) : (
            <div className="space-y-0.5">
              {consolidatedUsers.map((user) => (
                <Link
                  key={user.id}
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
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Master Password Reset Section */}
      <Card className="mb-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-xl font-semibold flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-destructive" />
            Master Password Reset
          </CardTitle>
          <CardDescription>
            Reset passwords for all users who have never logged in to "123456"
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <p className="text-sm text-muted-foreground">
                This will reset passwords for users who have <strong>never logged in</strong>. 
                Users who have already logged in will be skipped. 
                All affected users will be required to change their password on next login.
              </p>
            </div>
            
            {resetResults && (
              <div className="rounded-lg border border-border bg-muted/30 p-4">
                <p className="text-sm font-medium mb-2">Last Reset Results:</p>
                <div className="flex gap-4 text-sm">
                  <span className="text-green-600">{resetResults.successCount} reset</span>
                  <span className="text-muted-foreground">{resetResults.skippedCount} skipped</span>
                  {resetResults.failCount > 0 && (
                    <span className="text-destructive">{resetResults.failCount} failed</span>
                  )}
                </div>
              </div>
            )}

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button 
                  variant="destructive" 
                  className="gap-2"
                  disabled={isResettingPasswords}
                >
                  {isResettingPasswords ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Resetting...
                    </>
                  ) : (
                    <>
                      <KeyRound className="h-4 w-4" />
                      Reset All Passwords
                    </>
                  )}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Reset All Passwords?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will reset passwords to "123456" for all users who have never logged in. 
                    This action cannot be undone. Are you sure you want to continue?
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction 
                    onClick={handleMasterPasswordReset}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Reset Passwords
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>

      {/* Service Schedule Section */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div className="space-y-1">
            <CardTitle className="text-xl font-semibold flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Service Schedule
            </CardTitle>
            <CardDescription>
              Configure service days and times for each campus
            </CardDescription>
          </div>
          {!isEditing && (
            <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
              Edit
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {campusesLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
            </div>
          ) : isEditing ? (
            <div className="space-y-6">
              {configs.map((config) => (
                <div key={config.id} className="border border-border rounded-lg p-4 space-y-4">
                  <p className="font-semibold text-foreground">{config.name}</p>

                  {/* Saturday Services */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant={config.has_saturday_service ? "destructive" : "outline"}
                          size="icon"
                          className="h-7 w-7 shrink-0"
                          onClick={() => toggleService(config.id, "has_saturday_service")}
                        >
                          {config.has_saturday_service ? (
                            <Minus className="h-3.5 w-3.5" />
                          ) : (
                            <Plus className="h-3.5 w-3.5" />
                          )}
                        </Button>
                        <span className={`text-sm font-medium ${config.has_saturday_service ? 'text-foreground' : 'text-muted-foreground'}`}>
                          Saturday
                        </span>
                      </div>
                      {config.has_saturday_service && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs gap-1"
                          onClick={() => addServiceTime(config.id, "saturday")}
                        >
                          <Plus className="h-3 w-3" />
                          Add Time
                        </Button>
                      )}
                    </div>
                    
                    {config.has_saturday_service ? (
                      <div className="ml-9 space-y-2">
                        {config.saturday_service_times.map((time, idx) => (
                          <div key={idx} className="flex items-center gap-2">
                            <Input
                              type="time"
                              value={time}
                              onChange={(e) => handleTimeChange(config.id, "saturday", idx, e.target.value)}
                              className="w-[130px]"
                            />
                            {config.saturday_service_times.length > 1 && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                onClick={() => removeServiceTime(config.id, "saturday", idx)}
                              >
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="ml-9 text-xs text-muted-foreground italic">No service</p>
                    )}
                  </div>

                  {/* Sunday Services */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant={config.has_sunday_service ? "destructive" : "outline"}
                          size="icon"
                          className="h-7 w-7 shrink-0"
                          onClick={() => toggleService(config.id, "has_sunday_service")}
                        >
                          {config.has_sunday_service ? (
                            <Minus className="h-3.5 w-3.5" />
                          ) : (
                            <Plus className="h-3.5 w-3.5" />
                          )}
                        </Button>
                        <span className={`text-sm font-medium ${config.has_sunday_service ? 'text-foreground' : 'text-muted-foreground'}`}>
                          Sunday
                        </span>
                      </div>
                      {config.has_sunday_service && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs gap-1"
                          onClick={() => addServiceTime(config.id, "sunday")}
                        >
                          <Plus className="h-3 w-3" />
                          Add Time
                        </Button>
                      )}
                    </div>
                    
                    {config.has_sunday_service ? (
                      <div className="ml-9 space-y-2">
                        {config.sunday_service_times.map((time, idx) => (
                          <div key={idx} className="flex items-center gap-2">
                            <Input
                              type="time"
                              value={time}
                              onChange={(e) => handleTimeChange(config.id, "sunday", idx, e.target.value)}
                              className="w-[130px]"
                            />
                            {config.sunday_service_times.length > 1 && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                onClick={() => removeServiceTime(config.id, "sunday", idx)}
                              >
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="ml-9 text-xs text-muted-foreground italic">No service</p>
                    )}
                  </div>
                </div>
              ))}

              {/* Save/Cancel buttons */}
              <div className="flex justify-end gap-2 pt-4 border-t border-border">
                <Button variant="outline" onClick={handleCancel}>
                  Cancel
                </Button>
                <Button onClick={handleSave} disabled={updateConfig.isPending}>
                  {updateConfig.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {campuses.map((campus: Campus) => (
                <div key={campus.id} className="border-b border-border pb-3 last:border-0 last:pb-0">
                  <p className="font-medium text-foreground">{campus.name}</p>
                  <div className="flex gap-4 text-sm text-muted-foreground mt-1">
                    <span className="flex items-center gap-1">
                      {campus.has_saturday_service ? (
                        <Check className="h-3.5 w-3.5 text-green-500" />
                      ) : (
                        <X className="h-3.5 w-3.5 text-muted-foreground/50" />
                      )}
                      Sat {campus.has_saturday_service ? formatTimes(campus.saturday_service_time) : "-"}
                    </span>
                    <span className="flex items-center gap-1">
                      {campus.has_sunday_service ? (
                        <Check className="h-3.5 w-3.5 text-green-500" />
                      ) : (
                        <X className="h-3.5 w-3.5 text-muted-foreground/50" />
                      )}
                      Sun {campus.has_sunday_service ? formatTimes(campus.sunday_service_time) : "-"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Service Flow Templates Section */}
      <Card className="mt-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-xl font-semibold flex items-center gap-2">
            <ListOrdered className="h-5 w-5 text-primary" />
            Service Flow Templates
          </CardTitle>
          <CardDescription>
            Create and manage master templates for service orders of each campus and ministry
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TemplateManager />
        </CardContent>
      </Card>
    </div>
  );
}
