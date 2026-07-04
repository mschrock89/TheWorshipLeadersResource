import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const WEEKEND_MINISTRY_ALIASES = ["weekend", "weekend_team", "sunday_am", "speaker"] as const;
const CREATIVE_MINISTRY_ALIASES = ["creative", "photo_team"] as const;
const LEGACY_CAMERA_POSITIONS = [
  "camera_1",
  "camera_2",
  "camera_3",
  "camera_4",
  "camera_5",
  "camera_6",
  "Camera 1",
  "Camera 2",
  "Camera 3",
  "Camera 4",
  "Camera 5",
  "Camera 6",
] as const;

const DB_POSITION_TO_UI_POSITION: Record<string, string> = {
  "Vocalist": "vocalist",
  "Announcements": "announcement",
  "Closing Prayer": "closing_prayer",
  "AG 1": "acoustic_1",
  "AG 2": "acoustic_2",
  "EG 1": "electric_1",
  "EG 2": "electric_2",
  "EG 3": "electric_3",
  "EG 4": "electric_4",
  "Bass": "bass",
  "Broadcast": "broadcast",
  "Camera 1": "tri_pod_camera",
  "Camera 2": "tri_pod_camera",
  "Camera 3": "tri_pod_camera",
  "Camera 4": "tri_pod_camera",
  "Camera 5": "tri_pod_camera",
  "Camera 6": "tri_pod_camera",
  "Director": "director",
  "Drums": "drums",
  "Drum Tech": "drum_tech",
  "Graphics": "graphics",
  "Keys": "keys",
  "Lighting": "lighting",
  "Other Instrument": "other_instrument",
  "Pad": "pad",
  "Piano": "piano",
  "Producer": "producer",
  "FOH": "sound_tech",
  "MON": "mon",
  "Lyrics": "media",
  "Switcher": "switcher",
  "Audio Shadow": "audio_shadow",
  "Tri-Pod Camera": "tri_pod_camera",
  "Hand-Held Camera": "hand_held_camera",
  "Photography Team": "photo_team",
  "Photo Team": "photo_team",
  "Art Team": "art_team",
};

const UI_POSITION_TO_DB_POSITION: Record<string, string> = {
  vocalist: "Vocalist",
  teacher: "Teacher",
  announcement: "Announcements",
  closing_prayer: "Closing Prayer",
  closer: "Closing Prayer",
  acoustic_guitar: "AG 1",
  acoustic_1: "AG 1",
  acoustic_2: "AG 2",
  electric_guitar: "EG 1",
  electric_1: "EG 1",
  electric_2: "EG 2",
  electric_3: "EG 3",
  electric_4: "EG 4",
  bass: "Bass",
  broadcast: "Broadcast",
  camera_1: "Tri-Pod Camera",
  camera_2: "Tri-Pod Camera",
  camera_3: "Tri-Pod Camera",
  camera_4: "Tri-Pod Camera",
  camera_5: "Tri-Pod Camera",
  camera_6: "Tri-Pod Camera",
  drums: "Drums",
  drum_tech: "Drum Tech",
  keys: "Keys",
  pad: "Pad",
  piano: "Piano",
  sound_tech: "FOH",
  mon: "MON",
  media: "Lyrics",
  audio_shadow: "Audio Shadow",
  lighting: "Lighting",
  producer: "Producer",
  tri_pod_camera: "Tri-Pod Camera",
  hand_held_camera: "Hand-Held Camera",
  director: "Director",
  graphics: "Graphics",
  switcher: "Switcher",
  photo_team: "Photography Team",
  art_team: "Art Team",
  other: "Other",
  other_instrument: "Other Instrument",
};

const LEGACY_POSITION_ALIASES: Record<string, string> = {
  closer: "closing_prayer",
  camera_1: "tri_pod_camera",
  camera_2: "tri_pod_camera",
  camera_3: "tri_pod_camera",
  camera_4: "tri_pod_camera",
  camera_5: "tri_pod_camera",
  camera_6: "tri_pod_camera",
};

function getNormalizedMinistryType(ministryType: string) {
  if (CREATIVE_MINISTRY_ALIASES.includes(ministryType as typeof CREATIVE_MINISTRY_ALIASES[number])) {
    return "creative";
  }

  return WEEKEND_MINISTRY_ALIASES.includes(ministryType as typeof WEEKEND_MINISTRY_ALIASES[number])
    ? "weekend_team"
    : ministryType;
}

export function getNormalizedCampusMinistryPosition(position: string) {
  return DB_POSITION_TO_UI_POSITION[position] ?? LEGACY_POSITION_ALIASES[position] ?? position;
}

function getStoredPosition(position: string) {
  const normalizedPosition = getNormalizedCampusMinistryPosition(position);
  return UI_POSITION_TO_DB_POSITION[normalizedPosition] ?? position;
}

function getEquivalentPositions(position: string) {
  const normalizedPosition = getNormalizedCampusMinistryPosition(position);
  const storedPosition = getStoredPosition(position);
  const positions = new Set([position, normalizedPosition, storedPosition]);

  if (normalizedPosition === "closing_prayer") {
    positions.add("closer");
    positions.add("Closing Prayer");
  }

  if (normalizedPosition === "tri_pod_camera") {
    LEGACY_CAMERA_POSITIONS.forEach((legacyPosition) => positions.add(legacyPosition));
  }

  return [...positions];
}

function getEquivalentMinistryTypes(ministryType: string) {
  if (CREATIVE_MINISTRY_ALIASES.includes(ministryType as typeof CREATIVE_MINISTRY_ALIASES[number])) {
    return [...CREATIVE_MINISTRY_ALIASES];
  }

  return WEEKEND_MINISTRY_ALIASES.includes(ministryType as typeof WEEKEND_MINISTRY_ALIASES[number])
    ? [...WEEKEND_MINISTRY_ALIASES]
    : [ministryType];
}

export interface CampusMinistryPosition {
  id: string;
  user_id: string;
  campus_id: string;
  ministry_type: string;
  position: string;
  created_at: string;
}

export function useAllCampusMinistryPositions() {
  return useQuery({
    queryKey: ["all-campus-ministry-positions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_campus_ministry_positions")
        .select("*");

      if (error) throw error;
      return (data as CampusMinistryPosition[]).map((item) => ({
        ...item,
        position: getNormalizedCampusMinistryPosition(item.position),
      }));
    },
  });
}

// Fetch all positions for a user grouped by campus and ministry
export function useUserCampusMinistryPositions(userId: string | undefined) {
  return useQuery({
    queryKey: ["user-campus-ministry-positions", userId],
    queryFn: async () => {
      if (!userId) return [];
      
      const { data, error } = await supabase
        .from("user_campus_ministry_positions")
        .select("*")
        .eq("user_id", userId);
      
      if (error) throw error;
      return (data as CampusMinistryPosition[]).map((item) => ({
        ...item,
        position: getNormalizedCampusMinistryPosition(item.position),
      }));
    },
    enabled: !!userId,
  });
}

// Toggle a single position for a specific campus+ministry combination
export function useToggleCampusMinistryPosition() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({
      userId,
      campusId,
      ministryType,
      position,
      isActive,
    }: {
      userId: string;
      campusId: string;
      ministryType: string;
      position: string;
      isActive: boolean;
    }) => {
      const equivalentMinistryTypes = getEquivalentMinistryTypes(ministryType);
      const normalizedMinistryType = getNormalizedMinistryType(ministryType);
      const normalizedPosition = getNormalizedCampusMinistryPosition(position);
      const storedPosition = getStoredPosition(normalizedPosition);
      const positionsToMatch = getEquivalentPositions(normalizedPosition);

      if (isActive) {
        // Remove the position
        const { error } = await supabase
          .from("user_campus_ministry_positions")
          .delete()
          .eq("user_id", userId)
          .eq("campus_id", campusId)
          .in("ministry_type", equivalentMinistryTypes)
          .in("position", positionsToMatch);
        
        if (error) throw error;
      } else {
        const { error: cleanupError } = await supabase
          .from("user_campus_ministry_positions")
          .delete()
          .eq("user_id", userId)
          .eq("campus_id", campusId)
          .in("ministry_type", equivalentMinistryTypes)
          .in("position", positionsToMatch);

        if (cleanupError) throw cleanupError;

        // Add the position
        const { error } = await supabase
          .from("user_campus_ministry_positions")
          .insert({
            user_id: userId,
            campus_id: campusId,
            ministry_type: normalizedMinistryType,
            position: storedPosition,
          });
        
        if (error) throw error;
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ 
        queryKey: ["user-campus-ministry-positions", variables.userId] 
      });
      queryClient.invalidateQueries({
        queryKey: ["all-campus-ministry-positions"]
      });
      queryClient.invalidateQueries({ 
        queryKey: ["available-members"] 
      });
      queryClient.invalidateQueries({ 
        queryKey: ["available-members-campus-ministry"] 
      });
      queryClient.invalidateQueries({
        queryKey: ["available-members-with-positions"]
      });
    },
  });
}
