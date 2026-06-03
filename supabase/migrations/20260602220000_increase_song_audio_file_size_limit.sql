-- Raise the per-file size limit on the song-audio bucket to support large stem
-- audio files (WAV, high-bitrate MP3, etc.).
-- 524288000 bytes = 500 MB
UPDATE storage.buckets
SET file_size_limit = 524288000
WHERE id = 'song-audio';
