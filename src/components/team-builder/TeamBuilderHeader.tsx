import { Link } from "react-router-dom";
import { Users, Building2, Music, Eye, Home } from "lucide-react";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MINISTRY_TYPES } from "@/lib/constants";
import { Campus, RotationPeriod } from "@/hooks/useTeamBuilder";

interface TeamBuilderHeaderProps {
  isAdminUser: boolean;
  canEditCampus: boolean;
  campuses: Campus[];
  selectedCampusId: string | null;
  onCampusChange: (campusId: string) => void;
  periods: RotationPeriod[];
  selectedPeriodId: string | null;
  onPeriodChange: (periodId: string) => void;
  selectedMinistryType: string;
  onMinistryTypeChange: (type: string) => void;
}

export function TeamBuilderHeader({
  isAdminUser,
  canEditCampus,
  campuses,
  selectedCampusId,
  onCampusChange,
  periods,
  selectedPeriodId,
  onPeriodChange,
  selectedMinistryType,
  onMinistryTypeChange,
}: TeamBuilderHeaderProps) {
  return (
    <div className="mb-6">
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
            <BreadcrumbPage>Team Builder</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Users className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold">
              {isAdminUser ? "Team Builder" : "View My Team"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {isAdminUser 
                ? "Build and manage worship team rotations" 
                : "View your team assignments and teammates"}
            </p>
          </div>
        </div>

        {/* Campus Selector - separate row */}
        <Select value={selectedCampusId || ""} onValueChange={onCampusChange}>
          <SelectTrigger className="w-full sm:w-auto sm:min-w-[220px]">
            <Building2 className="mr-2 h-4 w-4 shrink-0" />
            <SelectValue placeholder="Select campus" />
          </SelectTrigger>
          <SelectContent>
            {campuses.map(campus => (
              <SelectItem key={campus.id} value={campus.id}>
                {campus.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Period and Ministry Selectors - same row, right-justified */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end mt-4">
        <Select
          value={selectedPeriodId || ""}
          onValueChange={onPeriodChange}
          disabled={periods.length === 0}
        >
          <SelectTrigger className="w-full sm:w-[180px] [&>span]:flex-1 [&>span]:text-center">
            <SelectValue placeholder="Select trimester" />
          </SelectTrigger>
          <SelectContent>
            {periods.map(period => (
              <SelectItem key={period.id} value={period.id}>
                {period.name}
                {period.is_active && " (Active)"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={selectedMinistryType} onValueChange={onMinistryTypeChange}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <Music className="mr-2 h-4 w-4 shrink-0" />
            <SelectValue placeholder="Select ministry" />
          </SelectTrigger>
          <SelectContent>
            {MINISTRY_TYPES.map(ministry => (
              <SelectItem key={ministry.value} value={ministry.value}>
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${ministry.color}`} />
                  {ministry.label}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* View-only indicator */}
      {isAdminUser && !canEditCampus && selectedCampusId && (
        <div className="mt-4">
          <Badge variant="secondary" className="gap-1.5">
            <Eye className="h-3 w-3" />
            View Only - You can only edit your assigned campus
          </Badge>
        </div>
      )}
    </div>
  );
}