-- Who saved the Video key on Settings → Video connection. Video's calls back
-- carry that key, so they may only touch that person's sends and files
-- (`workspace/docs/send-to-video.md`). A key saved before this column has no
-- owner, and Video's calls are refused until it is pasted again.

ALTER TABLE "viral_settings" ADD COLUMN IF NOT EXISTS "video_key_owner_id" varchar(36) REFERENCES "users"("id") ON DELETE SET NULL;
