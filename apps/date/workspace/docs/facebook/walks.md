# Facebook Dating walks

A walk is a list of plain phone actions that does one thing in Facebook Dating. They run through the same walk kit and job list as Tinder's (`../tinder/walks.md`), with Facebook's words (`FACEBOOK_SCREENS` in `src/server/facebook/screen-words.ts`).

## Getting into Dating

Facebook opens on its feed or wherever it was left. Every walk first opens Facebook's menu and taps Dating, then shuts a tip or two Dating puts in the way. Nothing outside Dating is pressed but the menu and its Dating shortcut. When Facebook shows the weekly surprise match, the walk takes it first (`facebook-dating.md`).

## Staying inside Dating

After every step, a screen must carry a Dating mark: two of Dating's tabs (Suggested, Likes, Matches) side by side, "It's a match", the weekly match's heading, or "Dating" (or "Dating settings") written across the top. One tab alone is not enough, because Facebook's feed shows its own "Suggested for you". A screen without one stops the profile with "Left Facebook Dating", and nothing is pressed on it. A Dating screen the walks have never seen also stops it. That is the safe side, and the fix is a mark added in `insideDating`.

## The walks

- **Read the card in front**, on Suggested, to the end of its page, then back to its top. Facebook having nobody left to suggest is not an error: the loop waits for the next day.
- **Read Likes you**: the first person on the list, opened and read like a card, with the comment they sent with their like.
- **Like and Pass**, once the profile is checked to be the one read. A Likes you person is opened from that list first; a Second Look like from Second Look's list. A like with the AI's comment taps the heart beside the answer it is about.
- **Read the chats, read a conversation, send, unmatch**: Tinder's chat walks on Facebook's Matches tab, under its headings "New matches" and "Conversations".
- **Report a scam and unmatch**: the conversation's menu, Report, the scam reason, Submit, then Unmatch and its confirm. The report counts only once Facebook says so ("Thanks for letting us know"); without that the walk fails, says the report may have gone, and unmatches nothing.
- **Set Dating's distance and ages**: Dating's settings from the gear, each slider dragged and read back. The slider ends (`FACEBOOK_SLIDERS`) are guesses.
- **Turn the break on or off**: Take a break in Dating's settings, tapped when it is wrong, read back.
- **Check the buttons after an update**: Suggested's Like and Pass and Dating's tabs, the Matches headings, and one conversation's message box, Send and menu, only looked at.
- **Who is signed in**: closes and opens Facebook so the way in passes its menu, reads the member's own name there, and stops the profile ("Facebook is signed in as Sam Lee now, not Tyler Pham.") when it differs from the last name read.

A like or pass counts only when Facebook moved on: someone else in front, nobody left to suggest, or back on the list without them. A screen that only hides the person, such as a box asking "Are you sure?", is not recorded.

Facebook's own screens are told by whole lines in their place, never by words anywhere on screen: a bio saying "meet cute" is not the weekly match, "No more people pleasers" is not the end of suggestions, and a message saying "you're going too fast" never stops the phone, because a stop screen is never one that shows Dating's tabs, a profile's Like and Pass, or a message box. Mutual friends are counted only from Facebook's "3 mutual friends" and "Mutual friends: …" lines.

Facebook Dating has no Super Like, and Date does not read or change the member's own Facebook Dating profile, so those walks are refused for a Facebook profile.

## Facebook's labels, and refreshing them

Every word and label is in `src/server/facebook/screen-words.ts`, and the stop screens' words in `src/server/facebook/stop-screens.ts`. They were written on 22 Oct 2026 before any phone was read, from how Facebook's Android app is known to label itself. Facebook draws its own screens and gives few view ids, so these are words and spoken labels only, each with several candidates.

**Until the first run on the real phone these are guesses.** When a walk cannot find something, it fails saying what, with a picture. To fix it:

1. In the dashboard's phone panel, under What the phone did, open the failed step's picture.
2. Look at the box's words or label on that screen, or let a walk read it.
3. Change or add the line in `screen-words.ts`.
4. The walks are tested against hand-made screens in `src/server/facebook/fixtures/fake-facebook.ts`. Swap a hand-made screen for a real one when a real one is read, and run `src/server/facebook/walks.test.ts`.

The first real run should be watched in the screen window, with Tyler there, in this order: Who is signed in, Read the card in front, a pass, Read the chats, Read a conversation. Like, send and report come after those pass.
