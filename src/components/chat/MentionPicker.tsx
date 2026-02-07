import { useState, useEffect, useRef } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface MentionPickerProps {
  searchTerm: string;
  onSelect: (profile: { id: string; full_name: string | null }) => void;
  onClose: () => void;
  position: { top: number; left: number } | null;
  campusId?: string | null;
  ministryType?: string | null;
}

// Fetch profiles filtered by campus and ministry using security definer function
function useProfilesForCampusMinistry(campusId: string | null | undefined, ministryType: string | null | undefined) {
  return useQuery({
    queryKey: ["profiles-for-campus-ministry-mention", campusId, ministryType],
    queryFn: async () => {
      if (!campusId || !ministryType) return [];
      
      // Use security definer function that allows all users to see
      // profiles of people in the same campus+ministry chat
      const { data: profiles, error } = await supabase.rpc(
        "get_profiles_for_chat_mention",
        { _campus_id: campusId, _ministry_type: ministryType }
      );
      
      if (error) throw error;
      return profiles || [];
    },
    enabled: !!campusId && !!ministryType,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}

export function MentionPicker({ searchTerm, onSelect, onClose, position, campusId, ministryType }: MentionPickerProps) {
  const { data: profiles } = useProfilesForCampusMinistry(campusId, ministryType);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const filteredProfiles = profiles?.filter((profile) =>
    profile.full_name?.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  // Reset selected index when search changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [searchTerm]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, filteredProfiles.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Enter" && filteredProfiles[selectedIndex]) {
        e.preventDefault();
        onSelect(filteredProfiles[selectedIndex]);
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [filteredProfiles, selectedIndex, onSelect, onClose]);

  if (!position || filteredProfiles.length === 0) return null;

  const getInitials = (name: string | null) => {
    if (!name) return "?";
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div
      ref={listRef}
      className="absolute z-50 bg-zinc-900 border border-zinc-700 rounded-lg shadow-lg max-h-48 overflow-y-auto w-64"
      style={{ bottom: position.top, left: position.left }}
    >
      {filteredProfiles.slice(0, 5).map((profile, index) => (
        <button
          key={profile.id}
          className={`w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-zinc-800 transition-colors ${
            index === selectedIndex ? "bg-zinc-800" : ""
          }`}
          onClick={() => onSelect(profile)}
        >
          <Avatar className="h-8 w-8">
            <AvatarImage src={profile.avatar_url || undefined} />
            <AvatarFallback className="bg-zinc-700 text-xs">
              {getInitials(profile.full_name)}
            </AvatarFallback>
          </Avatar>
          <span className="text-white text-sm truncate">{profile.full_name || "Unknown"}</span>
        </button>
      ))}
    </div>
  );
}
