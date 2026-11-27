-- Mail from robots in its own view (CRM task 38, part 4; Tyler picked "Robots
-- in their own view" on 25 Nov 2026). A conversation is a robot's when its
-- first mail came from a no-reply address or carried a mailing-list or
-- automatic-mail header; it then shows in the Inbox's Other view, not in All,
-- and rings no bell. `robot_by_hand` is set when a person says "Not a robot"
-- or "Move to Other", and the rule never changes such a one back.
-- `crm_leads.robot_choice` keeps that choice for the address, so their next
-- conversation lands where the person put the last one. Every existing
-- conversation counts as a person's, so nothing moves.
ALTER TABLE "crm_threads" ADD COLUMN IF NOT EXISTS "robot" boolean NOT NULL DEFAULT false;
ALTER TABLE "crm_threads" ADD COLUMN IF NOT EXISTS "robot_by_hand" boolean NOT NULL DEFAULT false;
ALTER TABLE "crm_leads" ADD COLUMN IF NOT EXISTS "robot_choice" varchar(8);
ALTER TABLE "crm_leads" DROP CONSTRAINT IF EXISTS "crm_leads_robot_choice_check";
ALTER TABLE "crm_leads" ADD CONSTRAINT "crm_leads_robot_choice_check"
  CHECK ("robot_choice" IS NULL OR "robot_choice" IN ('person', 'robot'));
