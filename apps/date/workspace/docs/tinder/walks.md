# Tinder walks

A walk is a list of plain phone actions that does one thing in Tinder. Walks run on the server (`src/server/tinder/walks/`), one at a time per phone, from the job list in `src/server/tinder/jobs.ts`. The dashboard and the AI ask for walks there and nowhere else.

## The walks

- **Read the card in front.** The card's name, age, distance and verified badge, every photo by tapping through until the first comes back or nothing moves, and the full profile by opening it and scrolling to the bottom. It leaves the phone on the same card.
- **Like, Super Like and Pass.** Only once the card in front is checked to be the one that was read: same name, same age, one of its photos on screen. Otherwise nothing is swiped. A like that comes back "It's a Match!" becomes a match at once. A Super Like that meets Tinder's offer to buy more shuts the offer by its way out and likes the card instead; nothing is bought.
- **Read the chats.** New matches and conversations, a few screenfuls down. A conversation whose last line changed is read next. A read that reaches the bottom of the list is complete, and a chat with messages missing from two complete reads in a row is marked "They unmatched" (`../chats/chats-and-replies.md`).
- **Read a conversation.** Every message back to the start or eight screenfuls, theirs on the left, ours on the right.
- **Send a message.** Types it, taps Send and checks it showed in the chat.
- **Unmatch.** Through Tinder's own menu and its confirm.
- **Read your profile.** The photos in order and every section, from the edit screen. Nothing is changed.
- **Who is signed in.** Run on Resume too, to see whether what stopped the phone has gone.
- **Set Tinder's distance and ages.** The Profile tab's gear, then each slider dragged and read back until it says Date's numbers, then Done and back to the cards. Written before the settings screen was ever read on a phone: its labels and the slider ends (`TINDER_SLIDERS`) are guesses.

## Every walk checks two things after each screen it reads

- **A stop screen** stops everything until Resume. See `stop-screens-and-limits.md`.
- **Another app in front** fails the walk and stops nothing. The phone was picked up, which is normal.

## The walk list

- **One walk per phone at a time**, oldest first. The same walk waiting is not added twice.
- **A walk runs apart from the 15-second pass**, so a card that takes a minute never holds up the shell's emails.
- **A lease is moved on before every step.** A walk past its lease belonged to a process that stopped and is marked "stopped part-way".
- **A failed walk keeps a picture** of the screen it stopped on, on its last step, shown on the Phone screen.

## Tinder's labels, and refreshing them

Every word and label the walks look for is in `src/server/tinder/screen-words.ts`. They were written on 18 Oct 2026 before any phone was read, from how Tinder's Android app is known to label itself. Each thing has several candidates, so one renamed label does not break a walk.

**Until the first run on the real phone these are guesses.** When a walk cannot find something, it fails saying what, with a picture. To fix it:

1. On the Phone screen, open the failed step's picture to see the screen.
2. Take a picture of that screen, or let a walk read it, and look at the box's words or label.
3. Change or add the line in `screen-words.ts`.
4. The walks are tested against hand-made screens in `src/server/tinder/fixtures/`. Swap a hand-made screen for a real one there when a real one is read, and run `src/server/tinder/walks.test.ts`.
