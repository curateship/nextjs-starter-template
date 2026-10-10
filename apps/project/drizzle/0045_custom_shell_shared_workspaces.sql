-- A workspace stops belonging to one person.
--
-- A workspace is this app's container: content lives in one, and contacts,
-- segments, broadcasts, broadcast templates, deliveries and email settings all
-- carry its id. Until now it also had an owner, required, with the foreign key
-- set to CASCADE — so deleting one account silently took that person's
-- workspaces with it, and every one of those tables along with them. Nothing in
-- `account-deletion.ts` said so; it happened in the schema, quietly.
--
-- That was a fair model while a workspace was somebody's private project. It
-- stops being fair the moment a workspace is a thing the deployment has — a
-- site with its own address, that other admins work on and the public visits.
-- An admin leaving should not take a site with them.
--
-- So the owner becomes optional. The column stays, because who made a workspace
-- is worth knowing, and it is still how "your workspaces" is worked out today.
-- It simply stops being the thing that decides whether the row lives.
--
-- ON DELETE SET NULL rather than CASCADE is the whole change: the workspace is
-- kept and its owner is emptied. What that leaves behind is a workspace nobody
-- owns, which is handled in the application — `listUserWorkspaces` shows those
-- alongside your own so they can be looked at or removed, and never picks one
-- as the workspace you are currently in.

ALTER TABLE "workspaces" ALTER COLUMN "user_id" DROP NOT NULL;

-- The old key was written inline in 0003 with no name of its own, so Postgres
-- picked one. Dropping a guessed name would silently do nothing and leave the
-- CASCADE in place next to the new key — deletion would still take workspaces
-- with it, and every test here would still pass. So the name is looked up.
DO $$
DECLARE
  existing_key text;
BEGIN
  SELECT conname INTO existing_key
  FROM pg_constraint
  WHERE conrelid = '"workspaces"'::regclass
    AND contype = 'f'
    AND conkey = ARRAY[(
      SELECT attnum FROM pg_attribute
      WHERE attrelid = '"workspaces"'::regclass AND attname = 'user_id'
    )]::smallint[];

  IF existing_key IS NOT NULL THEN
    EXECUTE format('ALTER TABLE "workspaces" DROP CONSTRAINT %I', existing_key);
  END IF;
END $$;

ALTER TABLE "workspaces"
  ADD CONSTRAINT "workspaces_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL;
