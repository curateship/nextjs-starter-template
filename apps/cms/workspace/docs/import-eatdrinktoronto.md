# Importing Eat Drink Toronto

This one-off command copies one old Directory site into one CMS site. It reads
the old database in a read-only transaction, keeps published listings published
and drafts private, and can be run again safely: source IDs update their existing
CMS listings, while existing category slugs are reused. Ratings from the old
Directory Core block carry into the CMS listing rating field.

Set `DIRECTORY_SOURCE_DATABASE_URL` to a read-only old-app database account.
The CMS database and media-storage settings continue to come from `.env.local`.

Preview the complete plan without changing either database or media storage:

```bash
pnpm run import:eatdrinktoronto -- --source-site <old-site-id> --site <cms-site-slug> --dry-run
```

Remove `--dry-run` to import. Use `--output <folder>` to choose where the
command writes `report.json` and `dropped.json`; otherwise it writes them to
`import-eatdrinktoronto-output` in this app.

The report separates created, updated, and unchanged listings, plus stored,
reused, and failed photos. `dropped.json` keeps opening hours, coordinates,
maps, and custom blocks under each new listing ID for the later fields task.
Remote images are limited to 10 MB, time out after 10 seconds, reject private
network addresses, and must have both a supported image type and matching file
contents.

## Test road map

1. Run `pnpm run db:setup` so migration 0060 has added the source markers.
2. Run the dry-run command and confirm it prints a report, writes the two JSON
   files, and changes neither database.
3. Run the import twice. The second report should show no created listings and
   the CMS listing and category totals should stay unchanged.
4. Open the target site's `/directory`, then inspect several listings and one
   nested category. Check their contact links, text, and locally stored photos.
5. Open one imported listing in Admin → Listings and save it without changes.
6. Compare five listings with their Eat Drink Toronto pages. Confirm every
   missing hours, map, coordinate, or custom block appears in `dropped.json`.
