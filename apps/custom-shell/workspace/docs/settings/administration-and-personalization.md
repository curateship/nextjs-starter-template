# Administration and personalization

Settings is the control room for the active workspace and platform. The rail is
two cards, and the line between them is what the app is allowed to decide.

**Platform settings** is the shell's half, and no app may take any of it over:
General settings, Navigation, Widgets, Styling, Email, Payments. All six are
about the signed-in workspace an admin works in.

**App settings** is everything an app may take over, in three blocks:

- The app's own rows first, with no heading, because the card already names
  them and they are the reason an admin opens it.
- **Members**: Navigation, the member sidebar and member top right menu.
- **Public**: Navigation for the signed-out header layout and links, Styling
  for the site's colours and frame, Pages for system-page wording, SEO for
  site-wide search defaults, and Social for X card choices.

Members and Public are the two audiences that are not the admin, and that is
the only cut that survives an app adding things. The rows under each heading
carry short names because the heading is what says whose Navigation and whose
Styling they are, and a heading is drawn at the same size and weight as the
card's own title.

The card is called **App settings** in every app rather than after the app. The
app's name is an editable field, so the card would rename itself the moment
somebody changed it, and an admin already knows which app they are in.

Two things moved to get here, both on 25 Sep 2026. Security, Notifications,
Storage and AI stopped being rows and became cards on General settings; each was
a single card already. Then the public rows moved out of the shell's card into
the app's, because the shell can scaffold a public site and cannot be right
about one for every app. The rail went from 16 rows in three cards to 6 and 6 in
two. An address saved before the first change, such as `/admin/settings/security`,
opens General settings, because an unknown tab id falls back to General and
General is where that content now lives.

Sidebar section cards have 16px between them, matching the containing card's
16px content inset. Add section and Reset all to defaults sit inside that
card beneath the sections and collapse with the editor. Each top right menu's
reset button also sits inside its card, beneath the menu items.

## What is on General settings

Seven cards, in this order. Each collapses on its own and remembers the choice
per browser.

1. **General settings** — app name, site name, the two home routes, rows per
   page, toast duration, the logo and the browser tab icon.
2. **Notifications** — one switch for whether the bell lights up the moment
   something happens, then the twelve kinds a bell may show. These were two
   cards on two screens before 25 Sep 2026 and are one question.
3. **Sessions** — how long a sign-in lasts. Tightening a limit asks first,
   because it signs people out.
4. **Old data** — what the app deletes for itself once a day.
5. **Cloudflare R2** — where uploaded files are kept.
6. **AI provider keys** — one key per provider.
7. **Maintenance mode** — last, because it is the one that shuts the app.

Cloudflare R2 and AI provider keys each load from the server when the screen
opens, which General settings did not do before. Both report their own
Saving…/Saved state to the sticky header, and both report nothing while idle so
the page's own save still shows. `use-reported-save-status.ts` holds that rule.

## An app's own settings rows

An app adds rows to the App settings card through `settings.tabs` in its
`src/app/options.ts`. They appear above Members. An app that adds nothing still
gets the card, opening on the Members heading.

**An app may also take over any row the shell put there.** It registers a tab
with that row's id, and its own screen takes that place and keeps the position,
so Public → Styling stays between Navigation and Pages whoever draws it. The six
claimable ids are `member-navigation`, `public-navigation`, `public-styling`,
`public-pages`, `public-seo` and `public-social`, listed as
`REPLACEABLE_SETTINGS_TAB_IDS` in `lib/app-options.ts`. Every id on Platform
settings is still refused out loud, and so is an id an app used twice.

Two reasons a real app needs this. Pomodoro's member pages draw their own
sidebar from a list in its own code and never read `memberSections`, so the
shell's member Navigation screen there edits settings no page of its reads. CMS
gives each site its own domain, which is a different question about public
navigation than a one-site app has.

**Claiming a row does not move the data.** `ShellConfig` still holds
`publicTheme`, `publicNavigation`, `memberSections` and the rest, and the
shell's `PublicPageFrame` and sidebar are still what draw from them. A
replacement screen has to write those same fields. One that writes somewhere of
its own is a settings screen that changes nothing.

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

Platform settings → Navigation combines Your sidebar and Your top right menu on
one page. App settings → Members → Navigation combines the member sidebar and
member top right menu separately, so editing one role's links does not change
the other role's links. The former Sidebar and Top right menu tabs are no longer listed.

Top left max items lives inside Your sidebar on Platform settings →
Navigation. It controls how
many links from the current sidebar section appear in the standard signed-in
header before the remaining links move into the vertical three-dot menu.
Choices are Show all, 3, 4, 5, 6, 7, and 8. Existing saved values are preserved;
Show all remains the default for an installation with no saved limit.
The limit is app-wide for standard admin and member headers. Phones keep their
compact navigation menu, and an app-owned replacement header controls its own
contents. Changes use the existing automatic save and survive a reload.


The header's colour-mode button is now a **settings cog**. It holds the three
colour modes as one pill — follow the device, light, dark — and under them
whatever switches the app running on this shell adds, such as Trade's "Hide
profit and loss". It is one row in Your top right menu, called Settings, and it
reorders and hides like every other row there. A menu saved before the change
kept a row called Theme; that row IS this control, so it keeps the place and
the on-or-off state it was left in.

Public pages keep their own separate colour-mode button, because a visitor who
is not signed in has no settings to put in a menu.

Navigation and widget settings can:

- Rename, reorder, hide, and group known navigation items.
- Change the dashboard arrangement within registered widget choices.

A hidden admin link does not make its route public.

Styling settings control:

- Colors and borders.
- Logo and icon.
- Font choices and sidebar dimensions.
- Public branding.

### One logo for everything

General settings has a single Logo field, and it uses the media library's
square image picker. That one picture is the logo above the signed-out pages
and the icon in every browser tab, on public pages as well as signed-in ones.
There is no separate favicon field, no dark logo field and no dark favicon
field. It is also the picture beside the site name at the top of the sidebar.

The app makes the dark-mode version itself. It reads the uploaded picture and
flips lightness alone, so dark ink becomes light ink and light ink becomes dark
while hue and saturation stay where they are. A navy mark comes back as pale
blue rather than the orange a photographic negative would give. An SVG stays an
SVG and is recoloured as text, so the signed-out logo is still a vector at any
size; every other format is redrawn pixel by pixel and saved as PNG, which is
the raster format that keeps a logo's transparent background.

Saving checks that the picture belongs to the admin's media library. The server
then writes the dark twin plus 16px, 32px, 180px and 512px PNG files from each
of the two, light and dark. Only the chosen version is linked from the page. The
other is still stored: it is what proves the stored chain was built from the
logo now saved, it is what makes the Browser tab icon setting instant, and
keeping it in the set is what lets the replacement sweep delete it when the logo
changes. The first page response includes the matching
browser icon links, so public pages have the right icon before any browser code
runs. Each save gets a new storage address to avoid stale browser caches.
Replacing or clearing the logo stops serving the old links and removes the
generated files. The original media-library image remains available.

**A Browser tab icon setting picks which of the two versions the tab shows**, and
only one is ever offered to the browser. It starts on the dark-mode version,
because tab strips are dark or grey far more often than they are white and a
logo drawn in near-black disappears on them. An admin whose tabs sit on white
picks the logo as uploaded instead. Both versions stay generated either way, so
flipping the setting redraws nothing.

Handing the browser both and letting it choose was tried first and did not work.
Marking the everyday mark `(prefers-color-scheme: light)` sounds like "only on a
light browser", but that query also matches a browser that states no preference
at all, so the everyday mark won for nearly everybody and the tab looked
unchanged. One unconditioned set is the only honest way to say which mark the
tab shows.

The sidebar follows a short order of preference. An app that builds distinct
sites, meaning `workspaces.siteBranding` is on, can give each site its own
picture, and that picture wins for that site. Every other app falls back to the
one uploaded logo, with its dark twin on a dark sidebar. That gate matters:
without it a picture left on a workspace row by an older screen would beat the
uploaded logo forever, which is exactly what happened before it was added. With
neither, the sidebar draws the plain shape chosen in the site editor's Icon
list. The picture is contained rather than cropped, so a logo wider than it is
tall keeps both its ends.

Nothing is redrawn on a save that leaves the logo alone. The app checks the
whole chain rather than the logo by itself, so an install carrying a separately
chosen favicon from before this rule rebuilds once on its next settings save
and is in step from then on. **Clearing the Logo field clears the browser tab
icon with it**, because they are the same picture. An install that had a
favicon set and no logo therefore loses that favicon on its next settings save.
Pick the picture in the Logo field before saving and it comes back as both.

App settings → Public → Styling is separate from Platform settings → Styling,
which is why they sit in different cards. Platform Styling changes the signed-in
workspace used by admins and members. Public Styling changes only the pages a
visitor can see before signing in. Font, corners,
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

The same card sets how wide the header spreads and how much it blurs. Full
width spreads the logo, menu and buttons across the whole window. Otherwise
Navigation width caps them at a number of pixels from 320 to 2560. Until a
number is typed there, the header follows the page width in Public Styling, so a
header saved before this setting existed stays where it was. A number outside
the range is marked and refused, and the last good width stays in use. Glass
blur effect is None, Light, Medium or Heavy. Medium is the blur the header
always had. The blur only shows where the page scrolls under a see-through
header, so it needs Sticky on, and a solid header colour from Styling covers it.

Public Navigation also has a User panel card, copied from the directory app's
User Panel. Edit user panel opens one window with three cards. Sign in and
Register each have an icon, a name, an address, a button style (Primary,
Outline or Ghost) and a Show on phones switch. Leaving a button's address empty
hides that button everywhere, which is how a site with closed sign-ups drops
Register. Signed-in menu links is a draggable list of up to 20 links, each with
an icon, a label and an address. Save refuses a nameless button, a link with no
label or address, and any address that is not a site path or a safe web
address, and names the problem in a toast. The defaults are Sign in to /login
and Create an account to /register, both shown on phones, with no extra links,
which is exactly what the header showed before the card existed.

Public Navigation also has a Breadcrumbs card, one switch per kind of page:
written pages, Search, and Pricing. Every switch starts off, so nothing on the
public site changes until one is turned on. The trail itself is described in
[Public pages, search, and SEO](../content/public-pages-search-and-seo.md).

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

Public SEO holds the title and description used only on the home page, plus a
title template and description template for written pages. The templates use
`{{page_title}}` for the page name and `{{site_title}}` for the current site
name. Empty template fields keep the former written-page title and description.
A page's own SEO fields take priority when the per-page editor supplies them.

The same tab holds the description and share image used when another public
page has no value of its own. The server checks that a new image belongs to the
current admin and changes its URL version when the image changes.

Public Social chooses the small or large X presentation and saves an optional X
account without `@`. Small is the default so older installs keep their previous
card style.

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

Each row also has a Hidden switch and a Shown on choice, and a header menu item
has the same Shown on choice. They have their own doc:
[Hiding a row, and choosing its screens](../content/showing-and-hiding-public-things.md).

The Page frame card controls the widest public content width, the canvas
colour, the space above and below main content, and the divider lines under the
header and above the footer. These choices are app-wide. Their defaults keep
the former 1152px width, muted canvas, 40px spacing, both divider lines, and
content centred. Content alignment can move every public page's main content
to the left, centre, or right.

Canvas colour, and every other colour on the Public Styling tab, uses the same
three-mode picker as the Platform Styling tab. Theme default keeps the colour
the theme already draws, and it adapts to light and dark on its own. Muted
tints the theme's own muted colour by a strength from 0 to 100. Custom colour
takes a 6-digit hex value and stays the same colour in light and dark. A canvas
colour saved before this picker existed reads as a custom colour, so the site
looks the same as it did.

Public Styling has the same spacing, border, divider, header and modal cards as
the Platform Styling tab, and they work the same way:

- **Spacing & borders.** Content spacing is the space at the sides of public
  content and between its blocks, from 0 to 48 pixels. The space above and
  below stays with Main spacing on the Page frame card. Setting content spacing
  to 0 is flat mode: public cards and tables lose their borders, their rounded
  corners and the gaps between them, and the card border control switches off
  because nothing would draw it. Card border sets that border's thickness from
  0 to 3 pixels, with its own colour.
- **Divider lines.** The thin lines inside public cards and tables, the rule
  under the header and the rule above the footer.
- **Header & footer.** The background of the public header bar and the footer.
  A chosen colour is drawn solid, the way the signed-in sidebar and sticky bar
  are, instead of the slightly see-through bar the theme default draws.
- **Modal** and **Cards inside modals.** Backdrop dimming, inner spacing,
  background, border width and border colour for windows that open over a
  public page. Nothing on the public site opens one yet. The settings exist so
  the first public window arrives already wearing the site's look.

Every one of those cards has a live preview that draws the values as they are
edited, not the signed-in app's own.

The Presets card at the top of the tab applies a whole named look in one
click, and saves the current one to come back to. It has its own doc:
[Public theme presets](public-theme-presets.md).

Public and platform styling never reach each other. Public values are written
onto the public frame and onto the document root only while a public page is on
screen, and they are removed when it leaves, so an admin who visits a public
page and returns to the app finds the app's own colours.

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
