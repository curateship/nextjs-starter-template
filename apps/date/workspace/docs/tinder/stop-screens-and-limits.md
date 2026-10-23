# Stop screens and limits

## Screens that stop everything

Out of likes, a verification wall, the account under review, banned, an update Tinder insists on, signed out, and Tinder not installed. Facebook Dating has its own list (`../facebook/facebook-dating.md`), and either app stops for buttons that went missing after an update (below).

- **The profile is marked stopped** with the reason and a picture of the screen, its swipe loop is switched off, and its walks and the phone's actions waiting are cancelled. Since 22 Oct 2026 the stop is the profile's, not the phone's: another profile on the same phone carries on.
- **Nothing runs for the profile until Resume** in the dashboard's phone panel, or the red line over the lead list.
- **Resume looks at the app again at once.** Out of likes clears itself once Tinder's timer has passed; still out of likes stops again with how long Tinder says is left.
- **Only a screen the profile's own app shows counts**, so another app's words never stop it.
- **The words name the profile's app**, such as "Facebook Dating is asking you to confirm it's you" (`stopReasonWords` in `src/lib/dating/options.ts`). The stored reason for an app not installed is still `tinder_missing`, whichever app it is, because a stored value is never renamed.

## After the app updates

When the phone reports a new version of the profile's app (Tinder's or Facebook's), a read-only check runs before the profile swipes again (part 7 of `../../tasks/facebook/01-facebook-dating.md`, and part 1 of `../../tasks/features/04-phone-tinder-and-hinge.md`).

- **It looks at each screen the walks use**: the cards' like and pass, the chat tab and the chat list's headings, and one conversation's message box, Send and menu. It never likes, passes, sends or unmatches, and never types.
- **All found**: the version is kept as checked on the phone (`tinder_version_checked` or `facebook_version_checked`, `drizzle/0114_date_app_version_checked.sql`) and swiping carries on.
- **Any missing**: the profile stops with "Tinder changed after an update, and some of its buttons can't be found", the Phone panel names them, such as "Can't find: Like button, Send button", with a picture of the first screen one was missing from. Resume runs the check again.
- **A check that fails for another reason**, such as the phone being picked up, is tried again ten minutes later.
- **A phone paired before this** counts its version on that day as checked, so only a later update starts a check.

## An app that froze

When Android says the app isn't responding, or Facebook's screen comes back empty on a second look 2.5 seconds later, the phone closes the app and opens it again, and the walk starts over, once (part 6). A second freeze fails the walk. A walk that already typed something into the app is never started over, because a message or comment half-typed into a frozen app may have gone: that walk fails and says to check the chat on the phone.

## A message is never sent twice

Promo's rule, kept: "a comment or post is never tried twice".

- **The message is written down before anything is typed**, with a hash of its words.
- **The same words to the same person within a day are refused**, sent or on their way.
- **From the moment Send is tapped it is "unsure"** until it shows in the chat. A walk that fails after the tap leaves it unsure, and the next read of the chat settles it: found means sent, missing means not sent.
- **A read of the chat that finds no messages at all settles nothing**, because calling a sent message "not sent" would let it go again.
- **A message still waiting for its send walk is left alone by a read of the chat.** It was never typed, so it can't be in the chat yet. Until 22 Oct 2026 a read of the chat that ran first marked it "not sent", and its send walk then refused it.

## Limits

Tyler's choice, 17 Oct 2026, the careful ones, with 150 swipes a day added on 18 Oct 2026. The numbers and the quiet hours are in the Dating settings. Every count is the profile's own, so two profiles on one phone each keep their own limits.

Facebook Dating is slower, Tyler's choice of 22 Oct 2026 ("50 a day"), because a ban there loses the whole Facebook account: at most 50 swipes a day and 20 an hour, 8 to 20 seconds apart, whatever the profile's settings say (`FACEBOOK_PACE` in `src/lib/dating/options.ts`, `swipeLimits` in `src/server/tinder/limits.ts`). The settings window will not take a higher number for a Facebook profile.

| Limit | Default |
| --- | --- |
| Gap between swipes | 4 to 9 seconds, drawn at random (8 to 20 on Facebook) |
| Swipes a day, from midnight on the phone's clock | 150 (at most 50 on Facebook) |
| Swipes an hour | 60 (at most 20 on Facebook) |
| Messages an hour | 20 |
| Quiet hours, on the phone's own clock | 1am to 7am |

- **Quiet hours stop every walk.** The swipe loop pauses through them.
- **A walk a limit stops is refused before anything is written**, with which limit and when it is allowed again, such as "Quiet hours on the phone, 1:00 to 7:00. Allowed again at 07:00."
- **The gap only delays a swipe**: it waits its turn on the list.
- **Hitting the daily or hourly swipe limit ends the swipe loop**, saying so in the Swiping section of the dashboard's phone panel, with when it is allowed again, such as "150 swipes today, the most allowed. Allowed again at 00:00." A Like, a Super Like and a Pass all count. With a swiping schedule, the schedule starts the loop again once an hourly limit allows (`../ai/swiping-and-scoring.md`).
