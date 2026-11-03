# Activity types

Each person has their own list of activity types (Tyler, 2 Nov 2026: "Each
person edits"). Everyone starts with Flight, Hotel, Food, Sight, Transport and
Other, each with an icon and a colour. The icon and colour show on every card
of that type.

- **Where:** Settings → App settings → Activity types
  (`/admin/settings/activity-types`).
- **Saving:** a name saves 700ms after the last letter or when the field is
  left. An icon, colour or move up or down saves the moment it's picked. The
  page header says Saving…, Saved or why it wasn't saved.
- **Removing** asks first and says how many activities use the type. They
  move to Other. Other can't be removed, so every activity always has a home.
- **At most 30 types.**

## Who can reach it

The shell shows Settings → App settings to admins only, and people who sign
up are members. So today only admins can edit their types. A member gets the
six built-in types and can't change them. This is still open: Tyler decides
where members edit their types.

## Where it lives

`src/components/travel/activity-types-settings.tsx`, registered in
`src/app/options.ts`. The server side is `src/server/travel/types.ts`. Types are
made for a person the first time they're needed.
