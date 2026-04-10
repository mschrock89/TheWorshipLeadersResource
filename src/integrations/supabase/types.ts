export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      album_tracks: {
        Row: {
          album_id: string
          audio_url: string | null
          author: string | null
          created_at: string
          id: string
          song_id: string | null
          title: string | null
          track_number: number
        }
        Insert: {
          album_id: string
          audio_url?: string | null
          author?: string | null
          created_at?: string
          id?: string
          song_id?: string | null
          title?: string | null
          track_number?: number
        }
        Update: {
          album_id?: string
          audio_url?: string | null
          author?: string | null
          created_at?: string
          id?: string
          song_id?: string | null
          title?: string | null
          track_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "album_tracks_album_id_fkey"
            columns: ["album_id"]
            isOneToOne: false
            referencedRelation: "albums"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "album_tracks_song_id_fkey"
            columns: ["song_id"]
            isOneToOne: false
            referencedRelation: "songs"
            referencedColumns: ["id"]
          },
        ]
      }
      albums: {
        Row: {
          artwork_url: string | null
          created_at: string
          created_by: string | null
          display_order: number | null
          id: string
          title: string
          updated_at: string
        }
        Insert: {
          artwork_url?: string | null
          created_at?: string
          created_by?: string | null
          display_order?: number | null
          id?: string
          title: string
          updated_at?: string
        }
        Update: {
          artwork_url?: string | null
          created_at?: string
          created_by?: string | null
          display_order?: number | null
          id?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      auditions: {
        Row: {
          audition_date: string
          campus_id: string | null
          candidate_id: string
          candidate_track: string
          created_at: string
          created_by: string | null
          end_time: string | null
          harmony_song: string | null
          id: string
          lead_song: string | null
          notes: string | null
          song_one: string | null
          song_two: string | null
          stage: string
          start_time: string | null
          status: string
          updated_at: string
        }
        Insert: {
          audition_date: string
          campus_id?: string | null
          candidate_id: string
          candidate_track?: string
          created_at?: string
          created_by?: string | null
          end_time?: string | null
          harmony_song?: string | null
          id?: string
          lead_song?: string | null
          notes?: string | null
          song_one?: string | null
          song_two?: string | null
          stage?: string
          start_time?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          audition_date?: string
          campus_id?: string | null
          candidate_id?: string
          candidate_track?: string
          created_at?: string
          created_by?: string | null
          end_time?: string | null
          harmony_song?: string | null
          id?: string
          lead_song?: string | null
          notes?: string | null
          song_one?: string | null
          song_two?: string | null
          stage?: string
          start_time?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "auditions_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auditions_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auditions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      audition_setlist_assignments: {
        Row: {
          assigned_by: string | null
          created_at: string
          draft_set_id: string
          id: string
          user_id: string
        }
        Insert: {
          assigned_by?: string | null
          created_at?: string
          draft_set_id: string
          id?: string
          user_id: string
        }
        Update: {
          assigned_by?: string | null
          created_at?: string
          draft_set_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audition_setlist_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audition_setlist_assignments_draft_set_id_fkey"
            columns: ["draft_set_id"]
            isOneToOne: false
            referencedRelation: "draft_sets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audition_setlist_assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      break_requests: {
        Row: {
          blackout_dates: string[] | null
          created_at: string
          id: string
          ministry_type: string | null
          reason: string | null
          request_scope: string
          request_type: string
          reviewed_at: string | null
          reviewed_by: string | null
          rotation_period_id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          blackout_dates?: string[] | null
          created_at?: string
          id?: string
          ministry_type?: string | null
          reason?: string | null
          request_scope?: string
          request_type?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          rotation_period_id: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          blackout_dates?: string[] | null
          created_at?: string
          id?: string
          ministry_type?: string | null
          reason?: string | null
          request_scope?: string
          request_type?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          rotation_period_id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "break_requests_rotation_period_id_fkey"
            columns: ["rotation_period_id"]
            isOneToOne: false
            referencedRelation: "rotation_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      campuses: {
        Row: {
          created_at: string
          has_saturday_service: boolean | null
          has_sunday_service: boolean | null
          id: string
          name: string
          saturday_service_time: string[] | null
          sunday_service_time: string[] | null
        }
        Insert: {
          created_at?: string
          has_saturday_service?: boolean | null
          has_sunday_service?: boolean | null
          id?: string
          name: string
          saturday_service_time?: string[] | null
          sunday_service_time?: string[] | null
        }
        Update: {
          created_at?: string
          has_saturday_service?: boolean | null
          has_sunday_service?: boolean | null
          id?: string
          name?: string
          saturday_service_time?: string[] | null
          sunday_service_time?: string[] | null
        }
        Relationships: []
      }
      service_time_overrides: {
        Row: {
          campus_id: string
          created_at: string
          created_by: string | null
          id: string
          service_date: string
          service_times: string[]
          updated_at: string
        }
        Insert: {
          campus_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          service_date: string
          service_times: string[]
          updated_at?: string
        }
        Update: {
          campus_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          service_date?: string
          service_times?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_time_overrides_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_time_overrides_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_services: {
        Row: {
          campus_id: string
          created_at: string
          created_by: string | null
          end_time: string | null
          id: string
          is_active: boolean
          ministry_type: string
          repeat_until: string | null
          repeats_weekly: boolean
          service_date: string
          service_name: string
          start_time: string | null
          updated_at: string
        }
        Insert: {
          campus_id: string
          created_at?: string
          created_by?: string | null
          end_time?: string | null
          id?: string
          is_active?: boolean
          ministry_type: string
          repeat_until?: string | null
          repeats_weekly?: boolean
          service_date: string
          service_name: string
          start_time?: string | null
          updated_at?: string
        }
        Update: {
          campus_id?: string
          created_at?: string
          created_by?: string | null
          end_time?: string | null
          id?: string
          is_active?: boolean
          ministry_type?: string
          repeat_until?: string | null
          repeats_weekly?: boolean
          service_date?: string
          service_name?: string
          start_time?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_services_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_services_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_service_assignments: {
        Row: {
          assigned_by: string | null
          assignment_date: string
          created_at: string
          custom_service_id: string
          id: string
          role: Database["public"]["Enums"]["team_position"]
          user_id: string
        }
        Insert: {
          assigned_by?: string | null
          assignment_date: string
          created_at?: string
          custom_service_id: string
          id?: string
          role: Database["public"]["Enums"]["team_position"]
          user_id: string
        }
        Update: {
          assigned_by?: string | null
          assignment_date?: string
          created_at?: string
          custom_service_id?: string
          id?: string
          role?: Database["public"]["Enums"]["team_position"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_service_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_service_assignments_custom_service_id_fkey"
            columns: ["custom_service_id"]
            isOneToOne: false
            referencedRelation: "custom_services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_service_assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          attachments: string[] | null
          campus_id: string | null
          content: string
          created_at: string
          id: string
          ministry_type: string | null
          user_id: string
        }
        Insert: {
          attachments?: string[] | null
          campus_id?: string | null
          content: string
          created_at?: string
          id?: string
          ministry_type?: string | null
          user_id: string
        }
        Update: {
          attachments?: string[] | null
          campus_id?: string | null
          content?: string
          created_at?: string
          id?: string
          ministry_type?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      draft_set_song_vocalists: {
        Row: {
          created_at: string
          draft_set_song_id: string
          id: string
          vocalist_id: string
        }
        Insert: {
          created_at?: string
          draft_set_song_id: string
          id?: string
          vocalist_id: string
        }
        Update: {
          created_at?: string
          draft_set_song_id?: string
          id?: string
          vocalist_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "draft_set_song_vocalists_draft_set_song_id_fkey"
            columns: ["draft_set_song_id"]
            isOneToOne: false
            referencedRelation: "draft_set_songs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "draft_set_song_vocalists_vocalist_id_fkey"
            columns: ["vocalist_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      draft_set_songs: {
        Row: {
          created_at: string
          draft_set_id: string
          id: string
          sequence_order: number
          song_id: string
          song_key: string | null
          vocalist_id: string | null
          youtube_url: string | null
        }
        Insert: {
          created_at?: string
          draft_set_id: string
          id?: string
          sequence_order?: number
          song_id: string
          song_key?: string | null
          vocalist_id?: string | null
          youtube_url?: string | null
        }
        Update: {
          created_at?: string
          draft_set_id?: string
          id?: string
          sequence_order?: number
          song_id?: string
          song_key?: string | null
          vocalist_id?: string | null
          youtube_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "draft_set_songs_draft_set_id_fkey"
            columns: ["draft_set_id"]
            isOneToOne: false
            referencedRelation: "draft_sets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "draft_set_songs_song_id_fkey"
            columns: ["song_id"]
            isOneToOne: false
            referencedRelation: "songs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "draft_set_songs_vocalist_id_fkey"
            columns: ["vocalist_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      draft_set_song_charts: {
        Row: {
          chord_chart_text: string | null
          created_at: string
          created_by: string | null
          draft_set_song_id: string
          id: string
          source_song_version_id: string | null
          updated_at: string
          version_name: string
        }
        Insert: {
          chord_chart_text?: string | null
          created_at?: string
          created_by?: string | null
          draft_set_song_id: string
          id?: string
          source_song_version_id?: string | null
          updated_at?: string
          version_name?: string
        }
        Update: {
          chord_chart_text?: string | null
          created_at?: string
          created_by?: string | null
          draft_set_song_id?: string
          id?: string
          source_song_version_id?: string | null
          updated_at?: string
          version_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "draft_set_song_charts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "draft_set_song_charts_draft_set_song_id_fkey"
            columns: ["draft_set_song_id"]
            isOneToOne: true
            referencedRelation: "draft_set_songs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "draft_set_song_charts_source_song_version_id_fkey"
            columns: ["source_song_version_id"]
            isOneToOne: false
            referencedRelation: "song_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      draft_sets: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          campus_id: string
          created_at: string
          created_by: string
          custom_service_id: string | null
          id: string
          ministry_type: string
          notes: string | null
          plan_date: string
          published_at: string | null
          status: string
          submitted_for_approval_at: string | null
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          campus_id: string
          created_at?: string
          created_by: string
          custom_service_id?: string | null
          id?: string
          ministry_type?: string
          notes?: string | null
          plan_date: string
          published_at?: string | null
          status?: string
          submitted_for_approval_at?: string | null
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          campus_id?: string
          created_at?: string
          created_by?: string
          custom_service_id?: string | null
          id?: string
          ministry_type?: string
          notes?: string | null
          plan_date?: string
          published_at?: string | null
          status?: string
          submitted_for_approval_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "draft_sets_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "draft_sets_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "draft_sets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "draft_sets_custom_service_id_fkey"
            columns: ["custom_service_id"]
            isOneToOne: false
            referencedRelation: "custom_services"
            referencedColumns: ["id"]
          },
        ]
      }
      drum_kit_pieces: {
        Row: {
          batter_expected_head_life_days: number | null
          batter_head_brand: string | null
          batter_head_installed_on: string | null
          batter_head_model: string | null
          created_at: string
          cymbal_brand: string | null
          cymbal_crack_markers: Json
          cymbal_model: string | null
          id: string
          kit_id: string
          layout_x: number | null
          layout_y: number | null
          notes: string | null
          piece_label: string
          piece_type: string
          reso_expected_head_life_days: number | null
          reso_head_brand: string | null
          reso_head_installed_on: string | null
          reso_head_model: string | null
          size_inches: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          batter_expected_head_life_days?: number | null
          batter_head_brand?: string | null
          batter_head_installed_on?: string | null
          batter_head_model?: string | null
          created_at?: string
          cymbal_brand?: string | null
          cymbal_crack_markers?: Json
          cymbal_model?: string | null
          id?: string
          kit_id: string
          layout_x?: number | null
          layout_y?: number | null
          notes?: string | null
          piece_label: string
          piece_type: string
          reso_expected_head_life_days?: number | null
          reso_head_brand?: string | null
          reso_head_installed_on?: string | null
          reso_head_model?: string | null
          size_inches: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          batter_expected_head_life_days?: number | null
          batter_head_brand?: string | null
          batter_head_installed_on?: string | null
          batter_head_model?: string | null
          created_at?: string
          cymbal_brand?: string | null
          cymbal_crack_markers?: Json
          cymbal_model?: string | null
          id?: string
          kit_id?: string
          layout_x?: number | null
          layout_y?: number | null
          notes?: string | null
          piece_label?: string
          piece_type?: string
          reso_expected_head_life_days?: number | null
          reso_head_brand?: string | null
          reso_head_installed_on?: string | null
          reso_head_model?: string | null
          size_inches?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "drum_kit_pieces_kit_id_fkey"
            columns: ["kit_id"]
            isOneToOne: false
            referencedRelation: "drum_kits"
            referencedColumns: ["id"]
          },
        ]
      }
      drum_kits: {
        Row: {
          campus_id: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          campus_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          campus_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "drum_kits_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drum_kits_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drum_kits_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          audience_type: string | null
          campus_id: string | null
          campus_ids: string[] | null
          created_at: string | null
          created_by: string | null
          description: string | null
          end_time: string | null
          event_date: string
          id: string
          ministry_type: string | null
          ministry_types: string[] | null
          start_time: string | null
          teaching_week_id: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          audience_type?: string | null
          campus_id?: string | null
          campus_ids?: string[] | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          end_time?: string | null
          event_date: string
          id?: string
          ministry_type?: string | null
          ministry_types?: string[] | null
          start_time?: string | null
          teaching_week_id?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          audience_type?: string | null
          campus_id?: string | null
          campus_ids?: string[] | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          end_time?: string | null
          event_date?: string
          id?: string
          ministry_type?: string | null
          ministry_types?: string[] | null
          start_time?: string | null
          teaching_week_id?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_teaching_week_id_fkey"
            columns: ["teaching_week_id"]
            isOneToOne: false
            referencedRelation: "teaching_weeks"
            referencedColumns: ["id"]
          },
        ]
      }
      drum_tech_comments: {
        Row: {
          body: string
          campus_id: string
          created_at: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          body: string
          campus_id: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string
          campus_id?: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "drum_tech_comments_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drum_tech_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      drum_tech_comment_reactions: {
        Row: {
          comment_id: string
          created_at: string
          id: string
          reaction_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          comment_id: string
          created_at?: string
          id?: string
          reaction_type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          comment_id?: string
          created_at?: string
          id?: string
          reaction_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "drum_tech_comment_reactions_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "drum_tech_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drum_tech_comment_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      drum_tech_comment_replies: {
        Row: {
          body: string
          comment_id: string
          created_at: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          body: string
          comment_id: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string
          comment_id?: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "drum_tech_comment_replies_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "drum_tech_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drum_tech_comment_replies_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      event_rsvps: {
        Row: {
          created_at: string
          event_id: string
          id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_rsvps_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_rsvps_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      feed_post_likes: {
        Row: {
          created_at: string
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feed_post_likes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "feed_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feed_post_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      feed_post_comments: {
        Row: {
          body: string
          created_at: string
          id: string
          post_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          post_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          post_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feed_post_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "feed_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feed_post_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      feed_posts: {
        Row: {
          body: string | null
          category: string
          created_at: string
          created_by: string
          id: string
          scripture_reference: string | null
          title: string
          updated_at: string
          updated_by: string | null
          youtube_url: string | null
          youtube_video_id: string | null
        }
        Insert: {
          body?: string | null
          category: string
          created_at?: string
          created_by: string
          id?: string
          scripture_reference?: string | null
          title: string
          updated_at?: string
          updated_by?: string | null
          youtube_url?: string | null
          youtube_video_id?: string | null
        }
        Update: {
          body?: string | null
          category?: string
          created_at?: string
          created_by?: string
          id?: string
          scripture_reference?: string | null
          title?: string
          updated_at?: string
          updated_by?: string | null
          youtube_url?: string | null
          youtube_video_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feed_posts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feed_posts_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      message_reactions: {
        Row: {
          created_at: string
          id: string
          message_id: string
          reaction: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message_id: string
          reaction?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message_id?: string
          reaction?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      message_read_status: {
        Row: {
          campus_id: string
          created_at: string | null
          id: string
          last_read_at: string
          ministry_type: string | null
          user_id: string
        }
        Insert: {
          campus_id: string
          created_at?: string | null
          id?: string
          last_read_at?: string
          ministry_type?: string | null
          user_id: string
        }
        Update: {
          campus_id?: string
          created_at?: string | null
          id?: string
          last_read_at?: string
          ministry_type?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_read_status_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_read_status: {
        Row: {
          created_at: string
          id: string
          notification_id: string
          read_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          notification_id: string
          read_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          notification_id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: []
      }
      pco_connections: {
        Row: {
          access_token_encrypted: string | null
          campus_id: string | null
          connected_at: string | null
          created_at: string | null
          id: string
          last_sync_at: string | null
          pco_organization_name: string | null
          refresh_token_encrypted: string | null
          sync_active_only: boolean
          sync_birthdays: boolean | null
          sync_chord_charts: boolean
          sync_phone_numbers: boolean | null
          sync_positions: boolean | null
          sync_team_members: boolean | null
          token_expires_at: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          access_token_encrypted?: string | null
          campus_id?: string | null
          connected_at?: string | null
          created_at?: string | null
          id?: string
          last_sync_at?: string | null
          pco_organization_name?: string | null
          refresh_token_encrypted?: string | null
          sync_active_only?: boolean
          sync_birthdays?: boolean | null
          sync_chord_charts?: boolean
          sync_phone_numbers?: boolean | null
          sync_positions?: boolean | null
          sync_team_members?: boolean | null
          token_expires_at: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          access_token_encrypted?: string | null
          campus_id?: string | null
          connected_at?: string | null
          created_at?: string | null
          id?: string
          last_sync_at?: string | null
          pco_organization_name?: string | null
          refresh_token_encrypted?: string | null
          sync_active_only?: boolean
          sync_birthdays?: boolean | null
          sync_chord_charts?: boolean
          sync_phone_numbers?: boolean | null
          sync_positions?: boolean | null
          sync_team_members?: boolean | null
          token_expires_at?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pco_connections_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_songs: {
        Row: {
          created_at: string
          id: string
          plan_id: string
          sequence_order: number
          song_id: string
          song_key: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          plan_id: string
          sequence_order?: number
          song_id: string
          song_key?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          plan_id?: string
          sequence_order?: number
          song_id?: string
          song_key?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "plan_songs_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "service_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_songs_song_id_fkey"
            columns: ["song_id"]
            isOneToOne: false
            referencedRelation: "songs"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          anniversary: string | null
          avatar_url: string | null
          birthday: string | null
          created_at: string
          default_campus_id: string | null
          email: string
          full_name: string | null
          gender: string | null
          has_completed_onboarding: boolean
          id: string
          ministry_types: string[] | null
          must_change_password: boolean
          phone: string | null
          positions: Database["public"]["Enums"]["team_position"][] | null
          share_contact_with_campus: boolean
          share_contact_with_pastors: boolean
          updated_at: string
          welcome_email_sent_at: string | null
        }
        Insert: {
          anniversary?: string | null
          avatar_url?: string | null
          birthday?: string | null
          created_at?: string
          default_campus_id?: string | null
          email: string
          full_name?: string | null
          gender?: string | null
          has_completed_onboarding?: boolean
          id: string
          ministry_types?: string[] | null
          must_change_password?: boolean
          phone?: string | null
          positions?: Database["public"]["Enums"]["team_position"][] | null
          share_contact_with_campus?: boolean
          share_contact_with_pastors?: boolean
          updated_at?: string
          welcome_email_sent_at?: string | null
        }
        Update: {
          anniversary?: string | null
          avatar_url?: string | null
          birthday?: string | null
          created_at?: string
          default_campus_id?: string | null
          email?: string
          full_name?: string | null
          gender?: string | null
          has_completed_onboarding?: boolean
          id?: string
          ministry_types?: string[] | null
          must_change_password?: boolean
          phone?: string | null
          positions?: Database["public"]["Enums"]["team_position"][] | null
          share_contact_with_campus?: boolean
          share_contact_with_pastors?: boolean
          updated_at?: string
          welcome_email_sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_default_campus_id_fkey"
            columns: ["default_campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          updated_at: string
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          updated_at?: string
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      reference_track_markers: {
        Row: {
          created_at: string
          id: string
          reference_track_id: string
          sequence_order: number
          timestamp_seconds: number
          title: string
        }
        Insert: {
          created_at?: string
          id?: string
          reference_track_id: string
          sequence_order?: number
          timestamp_seconds?: number
          title: string
        }
        Update: {
          created_at?: string
          id?: string
          reference_track_id?: string
          sequence_order?: number
          timestamp_seconds?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "reference_track_markers_reference_track_id_fkey"
            columns: ["reference_track_id"]
            isOneToOne: false
            referencedRelation: "setlist_playlist_reference_tracks"
            referencedColumns: ["id"]
          },
        ]
      }
      rotation_periods: {
        Row: {
          campus_id: string | null
          created_at: string
          end_date: string
          id: string
          is_active: boolean
          name: string
          start_date: string
          trimester: number
          year: number
        }
        Insert: {
          campus_id?: string | null
          created_at?: string
          end_date: string
          id?: string
          is_active?: boolean
          name: string
          start_date: string
          trimester: number
          year: number
        }
        Update: {
          campus_id?: string | null
          created_at?: string
          end_date?: string
          id?: string
          is_active?: boolean
          name?: string
          start_date?: string
          trimester?: number
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "rotation_periods_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
        ]
      }
      service_flow_item_vocalists: {
        Row: {
          created_at: string
          id: string
          service_flow_item_id: string
          vocalist_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          service_flow_item_id: string
          vocalist_id: string
        }
        Update: {
          created_at?: string
          id?: string
          service_flow_item_id?: string
          vocalist_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_flow_item_vocalists_service_flow_item_id_fkey"
            columns: ["service_flow_item_id"]
            isOneToOne: false
            referencedRelation: "service_flow_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_flow_item_vocalists_vocalist_id_fkey"
            columns: ["vocalist_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      service_flow_items: {
        Row: {
          created_at: string
          duration_seconds: number | null
          id: string
          item_type: string
          notes: string | null
          sequence_order: number
          service_flow_id: string
          song_id: string | null
          song_key: string | null
          title: string
          vocalist_id: string | null
        }
        Insert: {
          created_at?: string
          duration_seconds?: number | null
          id?: string
          item_type: string
          notes?: string | null
          sequence_order?: number
          service_flow_id: string
          song_id?: string | null
          song_key?: string | null
          title: string
          vocalist_id?: string | null
        }
        Update: {
          created_at?: string
          duration_seconds?: number | null
          id?: string
          item_type?: string
          notes?: string | null
          sequence_order?: number
          service_flow_id?: string
          song_id?: string | null
          song_key?: string | null
          title?: string
          vocalist_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_flow_items_service_flow_id_fkey"
            columns: ["service_flow_id"]
            isOneToOne: false
            referencedRelation: "service_flows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_flow_items_song_id_fkey"
            columns: ["song_id"]
            isOneToOne: false
            referencedRelation: "songs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_flow_items_vocalist_id_fkey"
            columns: ["vocalist_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      service_flow_template_items: {
        Row: {
          created_at: string
          default_duration_seconds: number | null
          id: string
          item_type: string
          sequence_order: number
          template_id: string
          title: string
        }
        Insert: {
          created_at?: string
          default_duration_seconds?: number | null
          id?: string
          item_type: string
          sequence_order?: number
          template_id: string
          title: string
        }
        Update: {
          created_at?: string
          default_duration_seconds?: number | null
          id?: string
          item_type?: string
          sequence_order?: number
          template_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_flow_template_items_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "service_flow_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      service_flow_templates: {
        Row: {
          campus_id: string
          created_at: string
          created_by: string | null
          id: string
          ministry_type: string
          name: string
          updated_at: string
        }
        Insert: {
          campus_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          ministry_type?: string
          name: string
          updated_at?: string
        }
        Update: {
          campus_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          ministry_type?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_flow_templates_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_flow_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      service_flows: {
        Row: {
          campus_id: string
          created_at: string
          created_by: string | null
          created_from_template_id: string | null
          draft_set_id: string | null
          id: string
          ministry_type: string
          service_date: string
          updated_at: string
        }
        Insert: {
          campus_id: string
          created_at?: string
          created_by?: string | null
          created_from_template_id?: string | null
          draft_set_id?: string | null
          id?: string
          ministry_type?: string
          service_date: string
          updated_at?: string
        }
        Update: {
          campus_id?: string
          created_at?: string
          created_by?: string | null
          created_from_template_id?: string | null
          draft_set_id?: string | null
          id?: string
          ministry_type?: string
          service_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_flows_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_flows_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_flows_created_from_template_id_fkey"
            columns: ["created_from_template_id"]
            isOneToOne: false
            referencedRelation: "service_flow_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_flows_draft_set_id_fkey"
            columns: ["draft_set_id"]
            isOneToOne: false
            referencedRelation: "draft_sets"
            referencedColumns: ["id"]
          },
        ]
      }
      service_plans: {
        Row: {
          campus_id: string | null
          created_at: string
          id: string
          pco_plan_id: string
          plan_date: string
          plan_title: string | null
          service_type_name: string
          synced_at: string
        }
        Insert: {
          campus_id?: string | null
          created_at?: string
          id?: string
          pco_plan_id: string
          plan_date: string
          plan_title?: string | null
          service_type_name: string
          synced_at?: string
        }
        Update: {
          campus_id?: string | null
          created_at?: string
          id?: string
          pco_plan_id?: string
          plan_date?: string
          plan_title?: string | null
          service_type_name?: string
          synced_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_plans_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
        ]
      }
      setlist_approvals: {
        Row: {
          approver_id: string | null
          created_at: string
          draft_set_id: string
          id: string
          notes: string | null
          reviewed_at: string | null
          status: string
          submitted_at: string
          submitted_by: string
        }
        Insert: {
          approver_id?: string | null
          created_at?: string
          draft_set_id: string
          id?: string
          notes?: string | null
          reviewed_at?: string | null
          status?: string
          submitted_at?: string
          submitted_by: string
        }
        Update: {
          approver_id?: string | null
          created_at?: string
          draft_set_id?: string
          id?: string
          notes?: string | null
          reviewed_at?: string | null
          status?: string
          submitted_at?: string
          submitted_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "setlist_approvals_approver_id_fkey"
            columns: ["approver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "setlist_approvals_draft_set_id_fkey"
            columns: ["draft_set_id"]
            isOneToOne: false
            referencedRelation: "draft_sets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "setlist_approvals_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      setlist_confirmations: {
        Row: {
          confirmed_at: string
          created_at: string
          draft_set_id: string
          id: string
          user_id: string
        }
        Insert: {
          confirmed_at?: string
          created_at?: string
          draft_set_id: string
          id?: string
          user_id: string
        }
        Update: {
          confirmed_at?: string
          created_at?: string
          draft_set_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "setlist_confirmations_draft_set_id_fkey"
            columns: ["draft_set_id"]
            isOneToOne: false
            referencedRelation: "draft_sets"
            referencedColumns: ["id"]
          },
        ]
      }
      setlist_playlist_reference_tracks: {
        Row: {
          audio_url: string
          created_at: string
          created_by: string | null
          duration_seconds: number | null
          id: string
          playlist_id: string
          sequence_order: number
          title: string
        }
        Insert: {
          audio_url: string
          created_at?: string
          created_by?: string | null
          duration_seconds?: number | null
          id?: string
          playlist_id: string
          sequence_order?: number
          title: string
        }
        Update: {
          audio_url?: string
          created_at?: string
          created_by?: string | null
          duration_seconds?: number | null
          id?: string
          playlist_id?: string
          sequence_order?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "setlist_playlist_reference_tracks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "setlist_playlist_reference_tracks_playlist_id_fkey"
            columns: ["playlist_id"]
            isOneToOne: false
            referencedRelation: "setlist_playlists"
            referencedColumns: ["id"]
          },
        ]
      }
      setlist_playlists: {
        Row: {
          campus_id: string
          created_at: string
          draft_set_id: string
          id: string
          ministry_type: string
          service_date: string
        }
        Insert: {
          campus_id: string
          created_at?: string
          draft_set_id: string
          id?: string
          ministry_type: string
          service_date: string
        }
        Update: {
          campus_id?: string
          created_at?: string
          draft_set_id?: string
          id?: string
          ministry_type?: string
          service_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "setlist_playlists_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "setlist_playlists_draft_set_id_fkey"
            columns: ["draft_set_id"]
            isOneToOne: true
            referencedRelation: "draft_sets"
            referencedColumns: ["id"]
          },
        ]
      }
      song_keys: {
        Row: {
          created_at: string | null
          display_order: number | null
          id: string
          key_name: string
        }
        Insert: {
          created_at?: string | null
          display_order?: number | null
          id?: string
          key_name: string
        }
        Update: {
          created_at?: string | null
          display_order?: number | null
          id?: string
          key_name?: string
        }
        Relationships: []
      }
      songs: {
        Row: {
          audio_url: string | null
          author: string | null
          bpm: number | null
          ccli_number: string | null
          created_at: string
          id: string
          pco_song_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          audio_url?: string | null
          author?: string | null
          bpm?: number | null
          ccli_number?: string | null
          created_at?: string
          id?: string
          pco_song_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          audio_url?: string | null
          author?: string | null
          bpm?: number | null
          ccli_number?: string | null
          created_at?: string
          id?: string
          pco_song_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      swap_request_dismissals: {
        Row: {
          dismissed_at: string
          id: string
          swap_request_id: string
          user_id: string
        }
        Insert: {
          dismissed_at?: string
          id?: string
          swap_request_id: string
          user_id: string
        }
        Update: {
          dismissed_at?: string
          id?: string
          swap_request_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "swap_request_dismissals_swap_request_id_fkey"
            columns: ["swap_request_id"]
            isOneToOne: false
            referencedRelation: "swap_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      swap_requests: {
        Row: {
          accepted_by_id: string | null
          created_at: string
          id: string
          message: string | null
          original_date: string
          position: string
          request_type: string
          requester_id: string
          resolved_at: string | null
          status: Database["public"]["Enums"]["swap_request_status"]
          swap_date: string | null
          target_user_id: string | null
          team_id: string
        }
        Insert: {
          accepted_by_id?: string | null
          created_at?: string
          id?: string
          message?: string | null
          original_date: string
          position: string
          request_type?: string
          requester_id: string
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["swap_request_status"]
          swap_date?: string | null
          target_user_id?: string | null
          team_id: string
        }
        Update: {
          accepted_by_id?: string | null
          created_at?: string
          id?: string
          message?: string | null
          original_date?: string
          position?: string
          request_type?: string
          requester_id?: string
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["swap_request_status"]
          swap_date?: string | null
          target_user_id?: string | null
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "swap_requests_accepted_by_id_fkey"
            columns: ["accepted_by_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "swap_requests_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "swap_requests_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "swap_requests_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "worship_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_progress: {
        Row: {
          completed_at: string | null
          current_plan_index: number
          current_service_type_index: number
          end_year: number | null
          error_message: string | null
          id: string
          start_year: number | null
          started_at: string
          status: string
          sync_type: string
          total_plans_processed: number
          total_service_types: number | null
          total_songs_processed: number
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          current_plan_index?: number
          current_service_type_index?: number
          end_year?: number | null
          error_message?: string | null
          id?: string
          start_year?: number | null
          started_at?: string
          status?: string
          sync_type: string
          total_plans_processed?: number
          total_service_types?: number | null
          total_songs_processed?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          current_plan_index?: number
          current_service_type_index?: number
          end_year?: number | null
          error_message?: string | null
          id?: string
          start_year?: number | null
          started_at?: string
          status?: string
          sync_type?: string
          total_plans_processed?: number
          total_service_types?: number | null
          total_songs_processed?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      team_members: {
        Row: {
          created_at: string
          display_order: number
          id: string
          member_name: string
          ministry_types: string[] | null
          position: string
          position_slot: string | null
          rotation_period_id: string | null
          service_day: string | null
          team_id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          member_name: string
          ministry_types?: string[] | null
          position: string
          position_slot?: string | null
          rotation_period_id?: string | null
          service_day?: string | null
          team_id: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          member_name?: string
          ministry_types?: string[] | null
          position?: string
          position_slot?: string | null
          rotation_period_id?: string | null
          service_day?: string | null
          team_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "team_members_rotation_period_id_fkey"
            columns: ["rotation_period_id"]
            isOneToOne: false
            referencedRelation: "rotation_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "worship_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_member_date_overrides: {
        Row: {
          created_at: string
          id: string
          member_name: string
          ministry_types: string[] | null
          position: string
          position_slot: string
          rotation_period_id: string
          schedule_date: string
          team_id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          member_name: string
          ministry_types?: string[] | null
          position: string
          position_slot: string
          rotation_period_id: string
          schedule_date: string
          team_id: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          member_name?: string
          ministry_types?: string[] | null
          position?: string
          position_slot?: string
          rotation_period_id?: string
          schedule_date?: string
          team_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "team_member_date_overrides_rotation_period_id_fkey"
            columns: ["rotation_period_id"]
            isOneToOne: false
            referencedRelation: "rotation_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_member_date_overrides_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "worship_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_rotation_drafts: {
        Row: {
          assignments: Json
          campus_id: string
          created_at: string
          id: string
          ministry_type: string
          published_at: string | null
          published_by: string | null
          rotation_period_id: string
          saved_by: string | null
          updated_at: string
        }
        Insert: {
          assignments?: Json
          campus_id: string
          created_at?: string
          id?: string
          ministry_type: string
          published_at?: string | null
          published_by?: string | null
          rotation_period_id: string
          saved_by?: string | null
          updated_at?: string
        }
        Update: {
          assignments?: Json
          campus_id?: string
          created_at?: string
          id?: string
          ministry_type?: string
          published_at?: string | null
          published_by?: string | null
          rotation_period_id?: string
          saved_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_rotation_drafts_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_rotation_drafts_rotation_period_id_fkey"
            columns: ["rotation_period_id"]
            isOneToOne: false
            referencedRelation: "rotation_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      team_period_locks: {
        Row: {
          created_at: string
          id: string
          locked_at: string
          locked_by: string | null
          rotation_period_id: string
          team_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          locked_at?: string
          locked_by?: string | null
          rotation_period_id: string
          team_id: string
        }
        Update: {
          created_at?: string
          id?: string
          locked_at?: string
          locked_by?: string | null
          rotation_period_id?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_period_locks_rotation_period_id_fkey"
            columns: ["rotation_period_id"]
            isOneToOne: false
            referencedRelation: "rotation_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_period_locks_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "worship_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_schedule: {
        Row: {
          campus_id: string | null
          created_at: string
          id: string
          ministry_type: string | null
          notes: string | null
          rotation_period: string
          schedule_date: string
          team_id: string
        }
        Insert: {
          campus_id?: string | null
          created_at?: string
          id?: string
          ministry_type?: string | null
          notes?: string | null
          rotation_period?: string
          schedule_date: string
          team_id: string
        }
        Update: {
          campus_id?: string | null
          created_at?: string
          id?: string
          ministry_type?: string | null
          notes?: string | null
          rotation_period?: string
          schedule_date?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_schedule_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_schedule_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "worship_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      user_campus_ministry_positions: {
        Row: {
          campus_id: string
          created_at: string
          id: string
          ministry_type: string
          position: string
          user_id: string
        }
        Insert: {
          campus_id: string
          created_at?: string
          id?: string
          ministry_type: string
          position: string
          user_id: string
        }
        Update: {
          campus_id?: string
          created_at?: string
          id?: string
          ministry_type?: string
          position?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_campus_ministry_positions_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_campus_ministry_positions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_campuses: {
        Row: {
          campus_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          campus_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          campus_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_campuses_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_campuses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_ministry_campuses: {
        Row: {
          campus_id: string
          created_at: string
          id: string
          ministry_type: string
          user_id: string
        }
        Insert: {
          campus_id: string
          created_at?: string
          id?: string
          ministry_type: string
          user_id: string
        }
        Update: {
          campus_id?: string
          created_at?: string
          id?: string
          ministry_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_ministry_campuses_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_ministry_campuses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          admin_campus_id: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          admin_campus_id?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          admin_campus_id?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_admin_campus_id_fkey"
            columns: ["admin_campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
        ]
      }
      weekend_rundown_song_feedback: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          rundown_id: string
          song_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          rundown_id: string
          song_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          rundown_id?: string
          song_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekend_rundown_song_feedback_rundown_id_fkey"
            columns: ["rundown_id"]
            isOneToOne: false
            referencedRelation: "weekend_rundowns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekend_rundown_song_feedback_song_id_fkey"
            columns: ["song_id"]
            isOneToOne: false
            referencedRelation: "songs"
            referencedColumns: ["id"]
          },
        ]
      }
      weekend_rundown_vocal_feedback: {
        Row: {
          created_at: string
          fit_label: string | null
          id: string
          notes: string | null
          rundown_id: string
          song_id: string
          updated_at: string
          vocalist_id: string
        }
        Insert: {
          created_at?: string
          fit_label?: string | null
          id?: string
          notes?: string | null
          rundown_id: string
          song_id: string
          updated_at?: string
          vocalist_id: string
        }
        Update: {
          created_at?: string
          fit_label?: string | null
          id?: string
          notes?: string | null
          rundown_id?: string
          song_id?: string
          updated_at?: string
          vocalist_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekend_rundown_vocal_feedback_rundown_id_fkey"
            columns: ["rundown_id"]
            isOneToOne: false
            referencedRelation: "weekend_rundowns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekend_rundown_vocal_feedback_song_id_fkey"
            columns: ["song_id"]
            isOneToOne: false
            referencedRelation: "songs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekend_rundown_vocal_feedback_vocalist_id_fkey"
            columns: ["vocalist_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      weekend_rundowns: {
        Row: {
          campus_id: string
          created_at: string
          id: string
          notes: string | null
          overall_status: string
          updated_at: string
          user_id: string
          weekend_date: string
        }
        Insert: {
          campus_id: string
          created_at?: string
          id?: string
          notes?: string | null
          overall_status: string
          updated_at?: string
          user_id: string
          weekend_date: string
        }
        Update: {
          campus_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          overall_status?: string
          updated_at?: string
          user_id?: string
          weekend_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekend_rundowns_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekend_rundowns_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      worship_teams: {
        Row: {
          color: string
          created_at: string
          icon: string
          id: string
          name: string
          template_config: Json
        }
        Insert: {
          color: string
          created_at?: string
          icon: string
          id?: string
          name: string
          template_config?: Json
        }
        Update: {
          color?: string
          created_at?: string
          icon?: string
          id?: string
          name?: string
          template_config?: Json
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_manage_drum_kits: {
        Args: { _campus_id: string }
        Returns: boolean
      }
      can_review_break_request: {
        Args: { _request_user_id: string }
        Returns: boolean
      }
      can_view_drum_kits: {
        Args: { _campus_id: string }
        Returns: boolean
      }
      can_view_break_request: {
        Args: { _request_user_id: string }
        Returns: boolean
      }
      cleanup_expired_setlist_playlists: { Args: never; Returns: undefined }
      cleanup_old_notification_reads: { Args: never; Returns: undefined }
      get_basic_profiles: {
        Args: never
        Returns: {
          avatar_url: string
          full_name: string
          id: string
        }[]
      }
      get_my_pco_connection: {
        Args: never
        Returns: {
          campus_id: string
          connected_at: string
          id: string
          last_sync_at: string
          pco_organization_name: string
          sync_active_only: boolean
          sync_birthdays: boolean
          sync_chord_charts: boolean
          sync_phone_numbers: boolean
          sync_positions: boolean
          sync_team_members: boolean
          user_id: string
        }[]
      }
      get_profile_safe: {
        Args: { profile_id: string }
        Returns: {
          anniversary: string
          avatar_url: string
          birthday: string
          created_at: string
          default_campus_id: string
          email: string
          full_name: string
          gender: string
          id: string
          phone: string
          positions: Database["public"]["Enums"]["team_position"][]
          share_contact_with_campus: boolean
          share_contact_with_pastors: boolean
          updated_at: string
        }[]
      }
      get_profiles_for_campus: {
        Args: never
        Returns: {
          anniversary: string
          avatar_url: string
          birthday: string
          email: string
          full_name: string
          gender: string
          id: string
          ministry_types: string[]
          phone: string
          positions: Database["public"]["Enums"]["team_position"][]
          share_contact_with_campus: boolean
          share_contact_with_pastors: boolean
          welcome_email_sent_at: string
        }[]
      }
      get_profiles_for_campus_id: {
        Args: { _campus_id: string }
        Returns: {
          avatar_url: string
          full_name: string
          id: string
          positions: Database["public"]["Enums"]["team_position"][]
        }[]
      }
      get_profiles_for_chat_mention: {
        Args: { _campus_id: string; _ministry_type: string }
        Returns: {
          avatar_url: string
          full_name: string
          id: string
        }[]
      }
      get_prior_song_uses: {
        Args: {
          _song_ids: string[]
          _before_date: string
          _campus_ids?: string[] | null
          _ministry_types?: string[] | null
        }
        Returns: { song_id: string; usage_count: number }[]
      }
      merge_songs: {
        Args: { source_song_id: string; target_song_id: string }
        Returns: undefined
      }
      get_songs_with_stats: {
        Args: never
        Returns: {
          author: string
          bpm: number
          ccli_number: string
          created_at: string
          first_used: string
          id: string
          last_used: string
          pco_song_id: string
          title: string
          upcoming_uses: number
          updated_at: string
          usage_count: number
          usages: Json
        }[]
      }
      get_upcoming_birthdays: {
        Args: never
        Returns: {
          avatar_url: string
          birthday: string
          full_name: string
          id: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_scheduled_for_service: {
        Args: {
          _campus_id: string
          _ministry_type: string
          _service_date: string
          _user_id: string
        }
        Returns: boolean
      }
      shares_campus_with: {
        Args: { _profile_id: string; _viewer_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role:
        | "leader"
        | "member"
        | "campus_pastor"
        | "admin"
        | "campus_worship_pastor"
        | "student_worship_pastor"
        | "speaker"
        | "volunteer"
        | "campus_admin"
        | "network_worship_leader"
        | "network_worship_pastor"
        | "video_director"
        | "production_manager"
        | "audition_candidate"
      swap_request_status: "pending" | "accepted" | "declined" | "cancelled"
      team_position:
        | "lead_vocals"
        | "harmony_vocals"
        | "background_vocals"
        | "teacher"
        | "announcement"
        | "closing_prayer"
        | "acoustic_guitar"
        | "electric_guitar"
        | "bass"
        | "drums"
        | "keys"
        | "piano"
        | "violin"
        | "cello"
        | "saxophone"
        | "trumpet"
        | "other_instrument"
        | "sound_tech"
        | "lighting"
        | "media"
        | "other"
        | "broadcast"
        | "electric_1"
        | "electric_2"
        | "camera_1"
        | "camera_2"
        | "camera_3"
        | "camera_4"
        | "director"
        | "graphics"
        | "producer"
        | "switcher"
        | "audio_shadow"
        | "mon"
        | "acoustic_1"
        | "acoustic_2"
        | "camera_5"
        | "camera_6"
        | "tri_pod_camera"
        | "hand_held_camera"
        | "vocalist"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "leader",
        "member",
        "campus_pastor",
        "admin",
        "campus_worship_pastor",
        "student_worship_pastor",
        "speaker",
        "volunteer",
        "campus_admin",
        "network_worship_leader",
        "network_worship_pastor",
        "video_director",
        "production_manager",
        "audition_candidate",
      ],
      swap_request_status: ["pending", "accepted", "declined", "cancelled"],
      team_position: [
        "lead_vocals",
        "harmony_vocals",
        "background_vocals",
        "teacher",
        "announcement",
        "closing_prayer",
        "acoustic_guitar",
        "electric_guitar",
        "bass",
        "drums",
        "keys",
        "piano",
        "violin",
        "cello",
        "saxophone",
        "trumpet",
        "other_instrument",
        "sound_tech",
        "lighting",
        "media",
        "other",
        "broadcast",
        "electric_1",
        "electric_2",
        "camera_1",
        "camera_2",
        "camera_3",
        "camera_4",
        "director",
        "graphics",
        "producer",
        "switcher",
        "audio_shadow",
        "mon",
        "acoustic_1",
        "acoustic_2",
        "camera_5",
        "camera_6",
        "tri_pod_camera",
        "hand_held_camera",
        "vocalist",
      ],
    },
  },
} as const
      user_serving_requirements: {
        Row: {
          attended_six_months: boolean
          created_at: string
          following_jesus: boolean
          serves_somewhere_else: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          attended_six_months?: boolean
          created_at?: string
          following_jesus?: boolean
          serves_somewhere_else?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          attended_six_months?: boolean
          created_at?: string
          following_jesus?: boolean
          serves_somewhere_else?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_serving_requirements_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
