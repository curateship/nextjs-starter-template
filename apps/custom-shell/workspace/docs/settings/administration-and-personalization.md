# Administration and personalization

Settings is the control room for the active workspace and platform. The page
groups its tabs under Platform, Members, and Public. An app may add its own lazy
tab through app options, so product settings do not need to enter the shell's
files.

The built-in settings groups contain:

- Platform tabs for general details, admin navigation, dashboard widgets,
  styling, security, notifications, email, payments, and AI.
- Member tabs for the member sidebar and top-right links.
- Public Navigation for the signed-out header and footer.

## Saving

Settings saving follows these rules:

- Save after 700 milliseconds without another edit.
- Put saves in one queue and give each save a version, so an older response
  cannot replace a newer change.
- Show saving, saved, or not saved in the sticky page header.
- Announce saved and failed states to assistive technology.

The workspace name is required. An empty name blocks the save and keeps the
unsaved state visible. Provider key fields preserve exactly what the admin typed
for the save in progress, even if another settings field changes while that
request is running.

The maintenance switch has its own server action because it shares the global
settings record with this page. Both writers lock and merge the record so one
change cannot erase another.

## Navigation and style choices

Navigation and widget settings can:

- Rename, reorder, hide, and group known navigation items.
- Change the dashboard arrangement within registered widget choices.

A hidden admin link does not make its route public.

Styling settings control:

- Colors and borders.
- Logo and icon.
- Font choices and sidebar dimensions.
- Public branding.

The shell turns those values into its runtime configuration and CSS variables.
UI code still uses shared components so a saved theme affects one system rather
than a set of one-off screens.

Divider lines write the shared `--border` colour. Card frames, table lines,
editor panels, sign-in cards, and resize handles all read that value through a
plain border class. Selected outlines and the fixed white email preview keep
their own colours because they are controls or message content, not app
dividers.
