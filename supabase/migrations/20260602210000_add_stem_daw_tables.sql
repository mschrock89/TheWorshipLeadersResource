-- Stem DAW: multi-track stem player for Weekend Tracks rehearsal.
-- Each setlist playlist can have one stem session (a "project") which
-- contains up to 11 individual stem tracks (drums, perc, bass, etc.).

-- ─── Stem types enum ─────────────────────────────────────────────────────────

-- Stereo pairs: drums (1/2), perc (3/4), guitars (7/8), piano (9/10), keys (11/12), aux (13/14)
-- Mono: bass (5), sub_bass (6), vocals (15), click/guide (16)
CREATE TYPE public.stem_type AS ENUM (
  'drums',
  'perc',
  'bass',
  'sub_bass',
  'guitars',
  'piano',
  'keys',
  'aux',
  'vocals',
  'click'
);

-- ─── Stem sessions ────────────────────────────────────────────────────────────
-- One session per playlist. Acts as the DAW "project" container.

CREATE TABLE public.setlist_stem_sessions (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  playlist_id   uuid        NOT NULL REFERENCES public.setlist_playlists(id) ON DELETE CASCADE,
  title         text        NOT NULL DEFAULT 'Stem Mix',
  bpm           int,
  created_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  UNIQUE (playlist_id)
);

CREATE INDEX idx_stem_sessions_playlist
  ON public.setlist_stem_sessions (playlist_id);

ALTER TABLE public.setlist_stem_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view stem sessions"
  ON public.setlist_stem_sessions
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Reference track managers can insert stem sessions"
  ON public.setlist_stem_sessions
  FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'network_worship_pastor'::app_role)
    OR has_role(auth.uid(), 'campus_pastor'::app_role)
    OR has_role(auth.uid(), 'campus_worship_pastor'::app_role)
    OR has_role(auth.uid(), 'student_worship_pastor'::app_role)
    OR has_role(auth.uid(), 'childrens_pastor'::app_role)
    OR has_role(auth.uid(), 'student_pastor'::app_role)
  );

CREATE POLICY "Reference track managers can update stem sessions"
  ON public.setlist_stem_sessions
  FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'network_worship_pastor'::app_role)
    OR has_role(auth.uid(), 'campus_pastor'::app_role)
    OR has_role(auth.uid(), 'campus_worship_pastor'::app_role)
    OR has_role(auth.uid(), 'student_worship_pastor'::app_role)
    OR has_role(auth.uid(), 'childrens_pastor'::app_role)
    OR has_role(auth.uid(), 'student_pastor'::app_role)
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'network_worship_pastor'::app_role)
    OR has_role(auth.uid(), 'campus_pastor'::app_role)
    OR has_role(auth.uid(), 'campus_worship_pastor'::app_role)
    OR has_role(auth.uid(), 'student_worship_pastor'::app_role)
    OR has_role(auth.uid(), 'childrens_pastor'::app_role)
    OR has_role(auth.uid(), 'student_pastor'::app_role)
  );

CREATE POLICY "Reference track managers can delete stem sessions"
  ON public.setlist_stem_sessions
  FOR DELETE TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'network_worship_pastor'::app_role)
    OR has_role(auth.uid(), 'campus_pastor'::app_role)
    OR has_role(auth.uid(), 'campus_worship_pastor'::app_role)
    OR has_role(auth.uid(), 'student_worship_pastor'::app_role)
    OR has_role(auth.uid(), 'childrens_pastor'::app_role)
    OR has_role(auth.uid(), 'student_pastor'::app_role)
  );

-- ─── Individual stems ─────────────────────────────────────────────────────────
-- One row per uploaded stem file within a session.

CREATE TABLE public.setlist_stems (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id       uuid        NOT NULL REFERENCES public.setlist_stem_sessions(id) ON DELETE CASCADE,
  stem_type        stem_type   NOT NULL,
  audio_url        text        NOT NULL,
  file_name        text        NOT NULL,
  duration_seconds float,
  volume           float       NOT NULL DEFAULT 1.0 CHECK (volume >= 0 AND volume <= 1),
  is_muted         boolean     NOT NULL DEFAULT false,
  sequence_order   int         NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  created_by       uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  UNIQUE (session_id, stem_type)
);

CREATE INDEX idx_setlist_stems_session
  ON public.setlist_stems (session_id);

ALTER TABLE public.setlist_stems ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view stems"
  ON public.setlist_stems
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Reference track managers can insert stems"
  ON public.setlist_stems
  FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'network_worship_pastor'::app_role)
    OR has_role(auth.uid(), 'campus_pastor'::app_role)
    OR has_role(auth.uid(), 'campus_worship_pastor'::app_role)
    OR has_role(auth.uid(), 'student_worship_pastor'::app_role)
    OR has_role(auth.uid(), 'childrens_pastor'::app_role)
    OR has_role(auth.uid(), 'student_pastor'::app_role)
  );

CREATE POLICY "Reference track managers can update stems"
  ON public.setlist_stems
  FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'network_worship_pastor'::app_role)
    OR has_role(auth.uid(), 'campus_pastor'::app_role)
    OR has_role(auth.uid(), 'campus_worship_pastor'::app_role)
    OR has_role(auth.uid(), 'student_worship_pastor'::app_role)
    OR has_role(auth.uid(), 'childrens_pastor'::app_role)
    OR has_role(auth.uid(), 'student_pastor'::app_role)
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'network_worship_pastor'::app_role)
    OR has_role(auth.uid(), 'campus_pastor'::app_role)
    OR has_role(auth.uid(), 'campus_worship_pastor'::app_role)
    OR has_role(auth.uid(), 'student_worship_pastor'::app_role)
    OR has_role(auth.uid(), 'childrens_pastor'::app_role)
    OR has_role(auth.uid(), 'student_pastor'::app_role)
  );

CREATE POLICY "Reference track managers can delete stems"
  ON public.setlist_stems
  FOR DELETE TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'network_worship_pastor'::app_role)
    OR has_role(auth.uid(), 'campus_pastor'::app_role)
    OR has_role(auth.uid(), 'campus_worship_pastor'::app_role)
    OR has_role(auth.uid(), 'student_worship_pastor'::app_role)
    OR has_role(auth.uid(), 'childrens_pastor'::app_role)
    OR has_role(auth.uid(), 'student_pastor'::app_role)
  );

-- ─── Storage policies for stems folder ───────────────────────────────────────
-- Stems are stored in song-audio/stems/ (separate from reference-tracks/).

CREATE POLICY "Reference track managers can upload stem audio"
ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'song-audio'
  AND (storage.foldername(name))[1] = 'stems'
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'network_worship_pastor'::app_role)
    OR has_role(auth.uid(), 'campus_pastor'::app_role)
    OR has_role(auth.uid(), 'campus_worship_pastor'::app_role)
    OR has_role(auth.uid(), 'student_worship_pastor'::app_role)
    OR has_role(auth.uid(), 'childrens_pastor'::app_role)
    OR has_role(auth.uid(), 'student_pastor'::app_role)
  )
);

CREATE POLICY "Reference track managers can update stem audio"
ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'song-audio'
  AND (storage.foldername(name))[1] = 'stems'
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'network_worship_pastor'::app_role)
    OR has_role(auth.uid(), 'campus_pastor'::app_role)
    OR has_role(auth.uid(), 'campus_worship_pastor'::app_role)
    OR has_role(auth.uid(), 'student_worship_pastor'::app_role)
    OR has_role(auth.uid(), 'childrens_pastor'::app_role)
    OR has_role(auth.uid(), 'student_pastor'::app_role)
  )
)
WITH CHECK (
  bucket_id = 'song-audio'
  AND (storage.foldername(name))[1] = 'stems'
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'network_worship_pastor'::app_role)
    OR has_role(auth.uid(), 'campus_pastor'::app_role)
    OR has_role(auth.uid(), 'campus_worship_pastor'::app_role)
    OR has_role(auth.uid(), 'student_worship_pastor'::app_role)
    OR has_role(auth.uid(), 'childrens_pastor'::app_role)
    OR has_role(auth.uid(), 'student_pastor'::app_role)
  )
);

CREATE POLICY "Reference track managers can delete stem audio"
ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'song-audio'
  AND (storage.foldername(name))[1] = 'stems'
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'network_worship_pastor'::app_role)
    OR has_role(auth.uid(), 'campus_pastor'::app_role)
    OR has_role(auth.uid(), 'campus_worship_pastor'::app_role)
    OR has_role(auth.uid(), 'student_worship_pastor'::app_role)
    OR has_role(auth.uid(), 'childrens_pastor'::app_role)
    OR has_role(auth.uid(), 'student_pastor'::app_role)
  )
);
