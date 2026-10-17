-- The team's avatar, a square picture beside its name on the Team dashboard
-- (Tyler, 16 Oct 2026: "whats missing is the avatar, we need to add that").
-- The team's photo (0105) is now the wide cover behind it. A media library
-- address, or null for the team's initials.
ALTER TABLE "project_teams" ADD COLUMN IF NOT EXISTS "avatar_url" text;
