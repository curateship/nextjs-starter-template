# Public theme presets

A preset is a whole public look under a name. Settings → Public site → Styling
opens with the Presets card, and applying one copies every value on that tab in
a single click.

**The app ships no presets.** Every one in the list is a look an admin saved,
and every one can be deleted. The card starts empty and says so.

## What a preset holds

Everything the Public Styling tab holds: brand colour and its four derived
colours, canvas, header and footer background, content spacing, card borders,
divider lines, page width, main spacing, alignment, background pattern, button
style and casing, colour mode, font and corner rounding. A preset is not a
partial look. Applying one replaces all of it.

The four squares beside a preset's name are its canvas, its header, its brand
colour and its card border, in that order. A value the preset leaves on Theme
default shows the colour the theme would draw, so the strip never claims a
preset fixes a colour it leaves alone.

## Saving a look

**Save current look** takes a name and keeps the tab exactly as it stands.
Presets are app-wide. An install can hold 20; asking for a twenty-first explains
that rather than refusing silently.

A stored preset with no name, no id, or an id another preset already uses is
dropped on read. A half-read preset would apply a half-built look in one click,
so the reader drops rather than repairs.

## Applying, and getting back

Applying asks first, because there is no undo. The settings page saves as soon
as a value changes, so the look that was on screen a moment ago is gone once the
save lands. The confirmation says so, and the way to keep a look is to save it
as a preset before trying another.

Deleting a preset removes it from the list and changes nothing about the public
site.

## Where it lives

- `lib/public-theme-presets.ts` — the type, the reader that drops anything
  unusable, and the swatch colours.
- `components/settings/public-theme-presets-card.tsx` — the card, the save
  window and the two confirmations.
- Saved presets ride in the app-wide settings row as `publicThemePresets`,
  beside `publicTheme`, and go through the same settings save as every other
  value on the tab. There is no separate server function for them.
