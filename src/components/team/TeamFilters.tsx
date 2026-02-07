import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, X } from "lucide-react";
import { POSITION_LABELS, POSITION_CATEGORIES } from "@/lib/constants";
import { useCampuses } from "@/hooks/useCampuses";

interface TeamFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  positionFilter: string;
  onPositionFilterChange: (value: string) => void;
  campusFilter: string;
  onCampusFilterChange: (value: string) => void;
  genderFilter?: string;
  onGenderFilterChange?: (value: string) => void;
  showGenderFilter?: boolean;
}

export function TeamFilters({
  search,
  onSearchChange,
  positionFilter,
  onPositionFilterChange,
  campusFilter,
  onCampusFilterChange,
  genderFilter = "all",
  onGenderFilterChange,
  showGenderFilter = false,
}: TeamFiltersProps) {
  const { data: campuses = [] } = useCampuses();

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      {/* Search */}
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by name or email..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9"
        />
        {search && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2"
            onClick={() => onSearchChange("")}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Campus filter */}
      <Select value={campusFilter} onValueChange={onCampusFilterChange}>
        <SelectTrigger className="w-full sm:w-[180px]">
          <SelectValue placeholder="All campuses" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All campuses</SelectItem>
          {campuses.map((campus) => (
            <SelectItem key={campus.id} value={campus.id}>
              {campus.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Position filter */}
      <Select value={positionFilter} onValueChange={onPositionFilterChange}>
        <SelectTrigger className="w-full sm:w-[180px]">
          <SelectValue placeholder="All positions" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All positions</SelectItem>
          
          <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Vocals</div>
          {POSITION_CATEGORIES.vocals.map((pos) => (
            <SelectItem key={pos} value={pos}>
              {POSITION_LABELS[pos]}
            </SelectItem>
          ))}
          
          <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Instruments</div>
          {POSITION_CATEGORIES.instruments.map((pos) => (
            <SelectItem key={pos} value={pos}>
              {POSITION_LABELS[pos]}
            </SelectItem>
          ))}
          
          <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Audio</div>
          {POSITION_CATEGORIES.audio.map((pos) => (
            <SelectItem key={pos} value={pos}>
              {POSITION_LABELS[pos]}
            </SelectItem>
          ))}
          
          <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Video</div>
          {POSITION_CATEGORIES.video.map((pos) => (
            <SelectItem key={pos} value={pos}>
              {POSITION_LABELS[pos]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Gender filter */}
      {showGenderFilter && onGenderFilterChange && (
        <Select value={genderFilter} onValueChange={onGenderFilterChange}>
          <SelectTrigger className="w-full sm:w-[140px]">
            <SelectValue placeholder="All genders" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All genders</SelectItem>
            <SelectItem value="male">Male</SelectItem>
            <SelectItem value="female">Female</SelectItem>
            <SelectItem value="not_set">Not set</SelectItem>
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
