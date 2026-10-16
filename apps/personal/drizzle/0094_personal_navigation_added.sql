-- Which menus have been given Personal's links to the other apps: 'members'
-- for the members' menu, 'workspace:<id>' for an admin's. Each is added once,
-- so an admin who later removes a link in Settings keeps it removed.
CREATE TABLE IF NOT EXISTS "personal_navigation_added" (
  "scope" varchar(80) PRIMARY KEY,
  "added_at" timestamptz NOT NULL
);
