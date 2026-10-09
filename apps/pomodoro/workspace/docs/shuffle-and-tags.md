# Shuffle and tags

A member can pick a group of sounds or themes instead of one: some tags, or
shuffle. Something from the group plays at once, and the next one comes when the
sound ends. The idea is Tyler's own, from 8 Oct 2026.

## Tyler's rules

- **"Add in app settings to checkbox shuffling sounds and themes for anon users
  and users that have not set their own custom themes and sounds."** The switch
  is on Settings → Themes and sounds; see [Admin settings](admin-settings.md).
- **"Add tag ability to sounds and themes and let user select tags as default
  first tab with another tab to select individual sound and theme. User can also
  select shuffle for both."**
- **The next one comes when the sound ends.** Tyler: "It should change when the
  sound ends and because of that, we have to make each sound 2-5 mins each." The
  theme changes at the same moment as the sound.
- **Shuffle draws from everything**, not from the member's tags. Picking tags is
  a separate choice, and draws only from those tags.
- **Each device picks for itself.** A phone and a laptop on the same shuffle can
  play different tracks.
- **A host can shuffle a room, or keep it to a tag.** Everybody in the room
  follows the room's choice, and each device picks its own next track from it.

## The pages

The Sounds and Theme pages each have two tabs, **By tag** first and **Pick one**
second, which is the page as it was. With nothing tagged at all, the page opens on
Pick one rather than on an empty tab.

- **By tag** shows every tag on Live items as a chip, with how many items carry
  it. Ticking chips says what will play ("Plays a random nature sound: 3 sounds
  to pick from."), and the usual buttons put it in your personal room, or in the
  room you host.
- **A free account counts only the free items**, and a tag with only Pro items
  says Pro and cannot be ticked.
- **Shuffle every sound** (or theme) is a switch beside the tabs, for your own
  room. On, a random item from everything your plan allows. Off, the one playing
  now stays as your pick.
- **The header player shows a Next button** while the sound is a group. It moves
  the sound on, and the theme too when the theme is a group.
- **Hosting a room** offers "Shuffle every sound" and "Only <tag> sounds" above
  the single sounds, and the same for themes.

## How it is stored

In the same columns a single choice is, so nothing that held `curated:<key>`
changed: `shuffle`, or `tags:nature,rain` (sorted, at most six tags). Migration
`0124_pomodoro_shuffle_tags_settings.sql` widened the three columns to 200
characters. A choice of silence is now saved as `none`, so it is told apart from
never having picked, which is what the admin's defaults fill in.

Before 8 Oct 2026 silence and never picking were both saved as empty, so the
two cannot be told apart in older rows. Tyler's rule, 8 Oct 2026: every sound
already saved as empty stays silent. The same migration turns those rows into
`none`, so the admin's default sound or shuffle reaches only somebody who
has not picked a sound since.

## How the next one is picked

- **The first pick is the server's**, sent with the page, so the first frame is
  already right (`firstPicks` in `media-pair.ts`).
- **The player says when the sound is about to end**, a moment before, so the
  next one crossfades in (`onCycleEnding` in `sound-fade.ts`). The room media
  store then picks the next sound and theme of every group on screen
  (`playNextFromPools`). It never repeats the same item twice in a row while
  there is another.
- **A theme group with a single sound** changes each time that sound comes round
  to its start again. A theme group with no sound playing stays put until one
  plays.
- **A room re-read every few seconds keeps what it is playing**, because the
  store compares the room's stored choice, not the item picked from it.

## Tags

An admin sets an item's tags in its window on the Themes and Sounds admin pages:
words separated by commas, lower case, up to eight, with the tags already in use
offered underneath. The sixteen built-in items came with starter tags (rain,
nature, cozy, music and the like), which an admin can change. See
[Themes and sounds in the admin](catalog-admin.md).

## Still to know

Today's eight built-in sounds run 44 to 53 seconds, so a shuffle changes the
sound and theme about every minute until longer versions exist.
