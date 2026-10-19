-- A program can carry a banner across the top of its dashboard's left panel
-- and a square picture beside its name, both picked from the person's own
-- uploads. Without them the banner is a soft fade and the picture is the
-- program's initials.
ALTER TABLE "fitness_programs" ADD COLUMN IF NOT EXISTS "banner_url" varchar(2048);
ALTER TABLE "fitness_programs" ADD COLUMN IF NOT EXISTS "avatar_url" varchar(2048);
