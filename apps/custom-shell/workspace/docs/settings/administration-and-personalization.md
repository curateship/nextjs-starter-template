# Administration and personalization

Settings is the control room for the active workspace and platform. The page
groups its tabs under Platform, Members, and Public. An app may add its own lazy
tab through app options, so product settings do not need to enter the shell's
files.

The built-in settings groups contain:

- Platform tabs for general details, admin navigation, dashboard widgets,
  styling, security, notifications, email, payments, and AI.
- Member tabs for the member sidebar and top-right links.
- Public Navigation for the signed-out header and footer, plus Public Look for
  the site's brand colour and the app's frame, font, and corner rounding.

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

Public Look is separate from Styling. Styling changes the signed-in workspace
used by admins and members. Public Look changes only the pages a visitor can see
before signing in. Font and corners are app-wide. Brand colour belongs to the
current site when the app gives workspaces their own public domains. An app
without public workspace domains uses one app-wide brand colour instead.

An app may supply the public look a fresh install starts with through its app
options. The app names only the fields it wants to change. A value saved in
Public Look replaces the matching app default, while untouched fields keep the
app's choice and omitted app fields keep Custom Shell's built-in look. The
option is code, not another settings record, so changing the app default
requires a deploy. The settings record keeps only values that differ from the
app default. Saving another setting does not freeze the inherited public look,
and a later app default still reaches every value the admin left alone.

Brand colour accepts a 6-digit hex value. The shell uses it for public buttons,
links, and focus rings. The shell also builds a distinct hover colour, a soft
selection tint, readable button text, and a brand colour that stays visible in
dark mode. Each automatic value appears in Public Look with its computed
colour. Editing an automatic value makes it manual, and Back to automatic makes
it follow the main brand colour again. A manual value survives later changes to
the main brand colour. Clearing the main field restores the app's normal public
colour without deleting those manual choices.

Public Look checks normal-size text at a contrast ratio of 4.5 to 1. The current
page text and background pass in both modes by default. A brand link or button
label that falls below the same line gets a plain warning beside the setting
for the mode that fails. Contrast warnings update while the admin types and
never block saving a valid colour.

The Page frame card controls the widest public content width, the canvas
colour, the space above and below main content, and the divider lines under the
header and above the footer. These choices are app-wide. Their defaults keep
the former 1152px width, muted canvas, 40px spacing, both divider lines, and
content centred. Content alignment can move every public page's main content
to the left, centre, or right. Canvas colours use the same 6-digit hex
validation as brand colours.

Colour mode in the same card can follow the visitor's device or pin every
public page to light or dark. Follow device is the default and shows a public
mode menu whose Light, Dark, or System choice is remembered in that browser.
A pinned mode wins over that saved visitor choice and hides the public menu.
The signed-in app keeps its own saved mode either way.

Coded public pages use the layout in their page declaration. Marketing pages
such as the front page, pricing, and search start at the top, use the shared
page width, and use their wider presentation. Sign-in pages and written pages
keep the card layout. The public content alignment applies to both layouts.

Migration `0075_custom_shell_public_brand_color.sql` copies CMS's old
`accentColor` into `publicTheme.brandColor` only when the new field does not
exist. An explicit new colour or an explicit clear always wins. The old key
stays in place for the previous CMS release during a rolling deploy. The next
CMS shell merge owns deleting its private editor, frame styling, and old reads.
Before the compatibility read goes, back up CMS workspace settings, deploy the
shared shell to every CMS process, and run a final backfill for any old process
that saved `accentColor` after migration `0075`. Confirm that no workspace has a
valid `accentColor` without a `publicTheme.brandColor`, then remove the private
CMS field and its remaining directory and share-image consumers. Migration
`0075` leaves `accentColor` untouched, so the previous CMS release remains the
rollback until the final cutover is complete.

The shell turns those values into its runtime configuration and CSS variables.
UI code still uses shared components so a saved theme affects one system rather
than a set of one-off screens.

The gutter setting is one shared value for page blocks, card groups, resizable
handles, and the panel gaps in the automation and newsletter editors. Code that
renders outside the usual page container reads the same fallback from the
shared layout value, so the default cannot drift between editors and pages.

Divider lines write the shared `--border` colour. Card frames, table lines,
editor panels, sign-in cards, and resize handles all read that value through a
plain border class. Selected outlines and the fixed white email preview keep
their own colours because they are controls or message content, not app
dividers.
