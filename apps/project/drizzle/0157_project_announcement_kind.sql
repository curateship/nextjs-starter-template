-- How important the team's announcement is, which colours its bar on the Team
-- dashboard: info (blue), good (green), warning (amber) or urgent (red) (Tyler,
-- 7 Nov 2026: "make this a different color depending on the importance of the
-- announcements"). One already up reads as info.
ALTER TABLE "project_teams" ADD COLUMN IF NOT EXISTS "announcement_kind" varchar(16) NOT NULL DEFAULT 'info';
