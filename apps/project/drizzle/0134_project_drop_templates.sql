-- Project templates are gone (Tyler, 28 Oct 2026, Misc 4: "We need to remove
-- the project templates feature too, its redeundent"). Copy project starts a
-- project from another one, and no real project used a template.
DROP TABLE IF EXISTS "project_templates";
