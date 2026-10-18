# The Dating dashboard

`/admin/dating`, under Dating in the left menu. Three columns. The left one opens 230 pixels wide and the right one 280, their narrowest, on any screen; the middle takes the rest. Copied copied from Promo's project columns: the sides shut and reopen, double-clicking a side's blank space shuts it, the dividers drag and the layout is remembered. Below 1280 pixels the list comes first, and an open card or chat sits behind a back arrow with the right column's cards under it.

## Left: Profiles and Matches

- **Profiles**: cards read, newest first, with the first photo, name and age, the AI's score and the swipe mark. The filter in the column's header shows all, liked, passed or not swiped. It is just its icon until the column is wide enough for its words, and the tab counts give way the same way, so nothing overlaps at the narrowest width.
- **Read profile**, beside Start in the right column's header, has the phone read the card Tinder is showing right now: its name, age, every photo and its full profile. It saves the card here for the AI to score. It never swipes; Start does the reading by itself, so this is for one card by hand.
- **Matches**: newest message first, with the unread count, the last line, a dot when a draft waits and a flag when the AI handed the chat to you. Read chats asks the phone to read the chat list.

## Middle: the person or the chat

- **A card**: its photos with arrows, every line Tinder showed, and Like and Pass. A card already swiped says who swiped it and when; a swipe on its way says so until the phone does it.
- **A chat**: theirs on the left, ours on the right marked "You" or "AI", newest at the bottom, with what is still sending, unsure or not sent. Refresh reads it again from the phone; Unmatch, after a confirm, unmatches on the phone.

## Right: the AI and the phone

- **What the AI thinks**: the score, its three lines, flags and dealbreakers, Read again; for a chat, the counts each way, whether a date was suggested, and the AI's question with an answer box.
- **Reply**: the AI's draft, yours to change, Send from phone and Regenerate. With automate on, the time it goes out by itself.
- **Phone**: here or away since when, battery, Date in control, the stop reason with Resume, Open screen window.
- **Start and Read profile** sit in the right column's header, beside the button that shuts every card. They show only their icons when the column is narrow.
- **Swiping**: swipes and messages this hour against the limits, AI spend against the cap, quiet hours, what the phone is doing now and the last problem.
- **My profile**: the AI's suggested photo order, bio and notes for your own profile.
- **Daily tally**: today and the six days before: swipes, likes, matches, messages sent, dates suggested.

The dashboard reads everything again every 4 seconds while the phone or the AI is busy, and every 15 otherwise.

## The Phone screen

`/admin/dating/phone`, under Dating: pairing, the "Date is in control" switch, Resume, the screen window, Take a picture, Unpair, what the phone did (walks and their steps with pictures) and the sample data.

## Sample data

Add sample data on the Phone screen adds 12 cards and 4 chats: one with a draft waiting, one flagged, one at five messages each way. The pictures are simple drawings in `public/sample/dating/`, not photos of anybody. Samples are marked as samples, the AI never reads one, and every button on one says "This is a sample, so nothing was sent to a phone." Remove sample data deletes only samples.
