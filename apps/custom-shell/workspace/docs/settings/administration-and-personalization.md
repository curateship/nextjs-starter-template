# Administration and personalization

Settings is the control room for the active workspace and platform. The page
groups its tabs under Platform, Members, and Public. An app may add its own lazy
tab through app options, so product settings do not need to enter the shell's
files.

The built-in settings groups contain:

- Platform tabs for general details, admin navigation, dashboard widgets,
  styling, security, notifications, email, payments, and AI.
- Member tabs for the member sidebar and top-right links.
- Public Navigation for the signed-out header layout and links, Public Styling
  for the site's colours and frame, Public Pages for system-page wording, and
  Public Social for sharing cards.

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

General settings has one app-wide favicon for every browser tab, including
public pages, plus an optional favicon for dark browser tabs. Each field uses
the media library's square image picker. The image shown beside a site in the
workspace switcher remains that site's own icon and is changed from the site
editor instead.

Saving a favicon checks that the image belongs to the admin's media library.
The server then makes 16px, 32px, 180px, and 512px PNG files from the one
selection. The first page response includes the matching browser icon links,
so public pages have the right favicon before any browser code runs. Each set
gets a new storage address to avoid stale browser caches. Replacing or clearing
a favicon stops serving the old links and removes the generated files. The
original media-library image remains available.

Public Styling is separate from the Platform Styling tab. Platform Styling
changes the signed-in workspace used by admins and members. Public Styling
changes only the pages a visitor can see before signing in. Font, corners,
background pattern, and button choices are app-wide. Brand colour belongs to
the current site when the app gives
workspaces their own public domains. An app without public workspace domains
uses one app-wide brand colour instead.

Public Navigation has one app-wide Header layout card. Sticky keeps the full
header at the top while a visitor scrolls. Menu position keeps desktop links
in the normal header flow or centres them on the page, while phones keep the
existing menu button. Small, standard, and large set the logo to 32px, 48px, or
64px high. Standard, scrolling, and left are the defaults. The public header
still shows the logo, site name, search, and colour-mode choice before any menu
or footer links have been added.

The Public menu card treats Search as a built-in draggable item. Its position
among the link chips is the order visitors see in the desktop header. The phone
menu puts a Search entry in the same order and opens the full search page.
The Visible checkbox hides Search from both headers but leaves its chip in the
editor so it can be switched on again. Search also disappears from the public
header when the Search page is switched off.

The same Public menu card can add a direct link or a named dropdown group.
Opening a group edits its name and ordered links in one window. Group-link
changes stay in that window until Save changes, so Cancel can discard them.
Trying to create a group without a name marks the Name field and shows its
message beside the field instead of raising a page-level toast.
Each child link has the same label, address checks, drag handle, and delete
control as the flat menu. Groups are one level deep and the menu has no
menu-specific link limit. Existing flat menus need no conversion.

The menu, footer links, and footer copyright are app-wide when workspace
domains are off. Saving them from any workspace changes the same public site.
When workspace domains are on, each workspace keeps its own menu and footer.
The move to app-wide single-site links keeps the most recently saved non-empty
workspace menu and footer, so existing public links are not lost. Existing
menus start with the new Search item where the old fixed search bar appeared.

An app may supply the public styling a fresh install starts with through its app
options. The app names only the fields it wants to change. A value saved in
Public Styling replaces the matching app default, while untouched fields keep
the app's choice and omitted app fields keep Custom Shell's built-in look. The
option is code, not another settings record, so changing the app default
requires a deploy. The settings record keeps only values that differ from the
app default. Saving another setting does not freeze the inherited public look,
and a later app default still reaches every value the admin left alone.

Brand colour accepts a 6-digit hex value. The shell uses it for public buttons,
links, and focus rings. The shell also builds a distinct hover colour, a soft
selection tint, readable button text, and a brand colour that stays visible in
dark mode. Each automatic value appears in Public Styling with its computed
colour. Editing an automatic value makes it manual, and Back to automatic makes
it follow the main brand colour again. A manual value survives later changes to
the main brand colour. Clearing the main field restores the app's normal public
colour without deleting those manual choices.

Public Styling checks normal-size text at a contrast ratio of 4.5 to 1. The
current page text and background pass in both modes by default. A brand link or
button label that falls below the same line gets a plain warning beside the
setting for the mode that fails. Contrast warnings update while the admin types
and never block saving a valid colour.

Public Social uses one media-library image across every public page.
The server checks that a new selection belongs to the current admin and changes
the image URL version when the selection changes. The same card chooses the
small or large X presentation and saves an optional X account without `@`.
Small is the default so older installs keep their previous card style.

Public Pages edits one short heading and plain-text body for both the 404 and
maintenance pages. Empty fields use the former built-in wording. The preview
uses the same fallback rules as the public page, so clearing a field shows what
a visitor will get before the settings save.

Public Pages also holds the app-wide front page row editor. An admin can add up
to six plain-text, plans, testimonial, FAQ, logo-strip, or screenshot rows. Each
row has a heading, an optional introduction, full or narrow width, and a fixed
set of fields for its kind. The editor accepts up to six testimonials or
screenshots and up to twelve FAQ entries or logos in one row. It uses the media
library for every picture and keeps the picker inside the row window.

A heading and at least one complete entry are required for content rows. The
server removes incomplete saved entries and refuses a newly selected image that
does not belong to the current admin's media library. Dragging changes the
public order. Removing every row brings back the built-in pricing front page,
so an untouched app does not change.

The Page frame card controls the widest public content width, the canvas
colour, the space above and below main content, and the divider lines under the
header and above the footer. These choices are app-wide. Their defaults keep
the former 1152px width, muted canvas, 40px spacing, both divider lines, and
content centred. Content alignment can move every public page's main content
to the left, centre, or right. Canvas colours use the same 6-digit hex
validation as brand colours.

The Background pattern card can leave the canvas plain or draw dots or a grid
over it. Small, medium, and large sizes control the spacing. Pattern opacity
starts at 8% and cannot exceed 20%, which keeps the texture behind the content
instead of competing with it. None and 0% draw no pattern at all.

The Buttons card changes public buttons without changing controls inside the
signed-in app. Solid is the default primary style. Outline gives primary
buttons a brand-coloured border and transparent fill. Labels can stay as
written or display in capitals. Destructive, ghost, and deliberately secondary
button styles keep their own treatment.

The Type & corners card accepts one app-wide WOFF2 font up to 1 MB. Uploading a
font selects it for the public site and adds its filename to the Font menu. The
built-in font choice stays saved underneath it. Selecting a built-in font keeps
the upload available for later, while removing the upload deletes its stored
file and returns the public site to that built-in choice. The signed-in app
continues to use Inter.

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
