-- A file's words, written down once (task polish/01, part 6).
--
-- Until now every tool that needed to know what a recording says paid to have
-- it written down again: the Words panel each time it was asked, Captions on
-- every run, and Tighten's filler words on every look. This table keeps the
-- first transcription of each file, so the next tool reads it for nothing.
--
-- One row per file and transcriber. Whisper measures when each word was said
-- and Gemini estimates it, so the app keeps them apart: a Whisper run only
-- reads Whisper's words, and a Gemini run reads Gemini's, or Whisper's when
-- that is all there is.
--
-- `words` is a JSON list of { "text", "startMs", "endMs" }, timed from the
-- start of the FILE. Not from a clip and not from the timeline, so trimming,
-- splitting or moving a clip never makes the saved words wrong. Each tool
-- takes the stretch its clip uses.
--
-- `duration_ms` is how long the file's sound was measured to be when it was
-- written down, which is what the price before the press is worked out from.
--
-- What deleting removes:
--
--   Deleting the file from Media deletes its rows (cascade). Deleting the
--   person deletes their files and so their rows.
--   "Transcribe again" in the Words panel replaces the row for that
--   transcriber.
--
-- Nothing is added for existing files. Their first run after this writes the
-- row.
CREATE TABLE IF NOT EXISTS "video_media_transcripts" (
  "media_id" varchar(36) NOT NULL REFERENCES "media"("id") ON DELETE CASCADE,
  "transcriber" varchar(20) NOT NULL,
  "model" varchar(60) NOT NULL,
  "words" jsonb NOT NULL,
  "duration_ms" integer NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  CONSTRAINT "video_media_transcripts_pkey" PRIMARY KEY ("media_id", "transcriber"),
  CONSTRAINT "video_media_transcripts_transcriber_check" CHECK ("transcriber" in ('openai', 'gemini')),
  CONSTRAINT "video_media_transcripts_duration_check" CHECK ("duration_ms" >= 0)
);
