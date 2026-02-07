import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ChevronDown } from "lucide-react";
import emLogo from "@/assets/em-logo.jpg";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

interface Campus {
  campus_id: string;
  campuses?: {
    name: string;
  };
}

interface Ministry {
  value: string;
  label: string;
}

interface ChatHeaderProps {
  campuses?: Campus[];
  selectedCampusId?: string | null;
  selectedCampusName?: string;
  onSelectCampus?: (campusId: string) => void;
  canSwitchCampus?: boolean;
  ministries?: readonly Ministry[];
  selectedMinistryType?: string;
  onSelectMinistry?: (ministryType: string) => void;
  getUnreadCount?: (campusId: string, ministryType: string) => number;
}

export function ChatHeader({
  campuses = [],
  selectedCampusId,
  selectedCampusName,
  onSelectCampus,
  canSwitchCampus = false,
  ministries = [],
  selectedMinistryType,
  onSelectMinistry,
  getUnreadCount
}: ChatHeaderProps) {
  const showDropdown = canSwitchCampus && campuses.length > 1 && onSelectCampus;

  return (
    <header className="flex-shrink-0 bg-black border-b border-zinc-800">
      {/* Campus name and dropdown */}
      <div className="flex items-center justify-between px-4 py-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild disabled={!showDropdown}>
            <div className={`flex items-center gap-3 ${showDropdown ? 'cursor-pointer' : ''}`}>
              <Avatar className="h-10 w-10">
                <AvatarImage src={emLogo} />
                <AvatarFallback className="bg-zinc-700">EM</AvatarFallback>
              </Avatar>
              <div className="flex items-center gap-1">
                <h1 className="text-lg font-semibold text-white">
                  {selectedCampusName || "Experience Worship"}
                </h1>
                {showDropdown && <ChevronDown className="h-4 w-4 text-zinc-400" />}
              </div>
            </div>
          </DropdownMenuTrigger>
          {showDropdown && (
            <DropdownMenuContent align="start" className="w-[calc(100vw-2rem)] max-w-md bg-zinc-900 border-zinc-700 z-50">
              {campuses.map(uc => (
                <DropdownMenuItem 
                  key={uc.campus_id} 
                  onClick={() => onSelectCampus(uc.campus_id)} 
                  className={selectedCampusId === uc.campus_id ? "bg-zinc-800" : ""}
                >
                  {uc.campuses?.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          )}
        </DropdownMenu>
      </div>

      {/* Ministry tabs */}
      {ministries.length > 0 && onSelectMinistry && (
        <div className="flex gap-1 px-4 pb-3 overflow-x-auto scrollbar-none">
          {ministries.map((ministry) => {
            const isSelected = selectedMinistryType === ministry.value;
            const unreadCount = getUnreadCount && selectedCampusId 
              ? getUnreadCount(selectedCampusId, ministry.value) 
              : 0;
            
            return (
              <button
                key={ministry.value}
                onClick={() => onSelectMinistry(ministry.value)}
                className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${
                  isSelected
                    ? "bg-primary text-primary-foreground"
                    : "bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700"
                }`}
              >
                {ministry.label}
                {unreadCount > 0 && !isSelected && (
                  <span className="flex items-center justify-center min-w-4 h-4 px-1 rounded-full bg-primary text-primary-foreground text-xs font-bold">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </header>
  );
}
