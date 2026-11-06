-- Parts 1 to 4 of the "More Viral features" task
-- (workspace/tasks/features/02-more-viral-features.md, workspace/docs/vault.md).
--
-- Part 1, vault ideas with no video. An idea is one of three kinds: a saved
-- video, a saved X, Reddit or LinkedIn post, or one you typed yourself. Every
-- idea before this is a video, so the default keeps them as they were.
ALTER TABLE "viral_vault_items" ADD COLUMN IF NOT EXISTS "kind" varchar(10) NOT NULL DEFAULT 'video';
ALTER TABLE "viral_vault_items" DROP CONSTRAINT IF EXISTS "ck_viral_vault_items_kind";
ALTER TABLE "viral_vault_items"
  ADD CONSTRAINT "ck_viral_vault_items_kind" CHECK ("kind" in ('video', 'post', 'own'));

-- A post keeps its network in "platform", its id in "platform_video_id" and
-- its address in "source_url", so saving the same post to the same project
-- again finds the same idea through ux_viral_vault_items_project_video. Only
-- your own idea has none of the three. NULLs never clash in a unique index,
-- so any number of your own ideas sit side by side.
ALTER TABLE "viral_vault_items" ALTER COLUMN "platform" DROP NOT NULL;
ALTER TABLE "viral_vault_items" ALTER COLUMN "platform_video_id" DROP NOT NULL;
ALTER TABLE "viral_vault_items" ALTER COLUMN "source_url" DROP NOT NULL;
ALTER TABLE "viral_vault_items" DROP CONSTRAINT IF EXISTS "ck_viral_vault_items_source";
ALTER TABLE "viral_vault_items"
  ADD CONSTRAINT "ck_viral_vault_items_source" CHECK (
    "kind" = 'own' OR ("platform" IS NOT NULL AND "platform_video_id" IS NOT NULL AND "source_url" IS NOT NULL)
  );

-- Part 2, posts into the vault: the post's own words, its title, the link it
-- carries, its subreddit and its writer, copied when it is saved so the post
-- going from Viral loses nothing.
ALTER TABLE "viral_vault_items" ADD COLUMN IF NOT EXISTS "post" jsonb;

-- Part 4, edit the script yourself. Your version of the script, part by part.
-- The AI's own stays unchanged in "analysis", behind Show original. NULL is no
-- edit, so the AI's version is what goes out.
ALTER TABLE "viral_vault_items" ADD COLUMN IF NOT EXISTS "edited_script" jsonb;
