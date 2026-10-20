-- The picture size an AI shot is made at (task
-- ai-generation/05-cheaper-video-models).
--
-- Google switches every Veo 3.1 model off on 22 Oct 2026 (the Gemini API
-- price and Veo pages, read 19 Oct 2026), so shots are now made with Gemini
-- Omni Flash, `gemini-omni-1.1-flash`. Its prices on Google's page that day:
-- $1.50 per million tokens in and $17.50 per million tokens of video out,
-- counted at 5,792 tokens a second of 720p video, about $0.10 a second. The
-- page gives no rate for 360p or 1080p. Veo 3.1 was $0.40 a second, Veo 3.1
-- Fast $0.10 and Veo 3.1 Lite $0.05, all at 720p.
--
-- The model each piece was made with is already on its row (`model`, written
-- when the shot is asked for), so the switch needs no new model column. What
-- is new is the size: Draft 360p, Normal 720p or Sharp 1080p.
--
-- Back-fill: every row written before this one was a Veo request, and every
-- Veo request was sent `resolution: "720p"`, so the default of '720p' fills
-- the old rows with the truth.
ALTER TABLE "video_ai_generations"
  ADD COLUMN IF NOT EXISTS "resolution" varchar(8) NOT NULL DEFAULT '720p';
