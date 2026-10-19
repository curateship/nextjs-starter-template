# The Dating dashboard

`/admin/dating`, under Dating in the left menu. Three columns. The left one opens 230 pixels wide and the right one 280, their narrowest, on any screen; the middle takes the rest. Copied copied from Promo's project columns: the sides shut and reopen, double-clicking a side's blank space shuts it, the dividers drag and the layout is remembered. Below 1280 pixels the list comes first, and an open card or chat sits behind a back arrow with the right column's cards under it.

## Left: Profiles and Matches

- **Profiles**: cards read, newest first, with the first photo, name and age, the AI's score and the swipe mark. The filter in the column's header shows all, liked, passed or not swiped. It is just its icon until the column is wide enough for its words, and the tab counts give way the same way, so nothing overlaps at the narrowest width.
- **Read profile**, beside Start in the right column's header, has the phone read the card Tinder is showing right now: its name, age, every photo and its full profile. It saves the card here for the AI to score. It never swipes; Start does the reading by itself, so this is for one card by hand.
- **Matches**: newest message first, with the unread count, the last line, a dot when a draft waits, a flag when the AI handed the chat to you, and an arrow when the chat is warming up or cooling off. Chats that are over, moved to text or unmatched sink to the bottom and say so first in their grey line. Above the list: the Ask Date box, Clear dead and Read chats, which shrink to their icons in a narrow column. Read chats asks the phone to read the chat list.
- **Dates**: every chat where they said yes to a date, newest first, with its time and place once set and their number.

## Middle: the person or the chat

- **A card**: its photos with arrows, every line Tinder showed, and Like and Pass. A card already swiped says who swiped it and when; a swipe on its way says so until the phone does it.
- **A chat**: theirs on the left, ours on the right marked "You" or "AI", newest at the bottom, with what is still sending, unsure or not sent. Refresh reads it again from the phone; Moved to text stops the AI there; Unmatch, after a confirm, unmatches on the phone. A chat the AI read as over says so with Not over; one moved to text says so with Undo.

## Right: the AI and the phone

- **Before your date**, on a chat where they said yes: their line, photos, when and where, their number, three lines from the chat and what they told you, with Add to calendar (`chats/dates-and-calendar.md`).
- **What the AI thinks**: the score, its three lines, flags and dealbreakers, Read again; for a chat, the counts each way, whether a date was suggested, warming up or cooling off with why, and the AI's question with an answer box.
- **Reply**: the AI's draft, yours to change, Send from phone, Tidy, Regenerate, Show 3 and the tone buttons, and how many of your last 20 drafts went unchanged. With automate on, the time it goes out by itself.
- **What they told you** and **This chat** (the AI drafts here switch and the note to the AI), on a chat (`chats/chats-and-replies.md`).
- **Phone**: here or away since when, battery, Date in control, the stop reason with Resume, Open screen window.
- **Start and Read profile** sit in the right column's header, beside the button that shuts every card. They show only their icons when the column is narrow.
- **Swiping**: swipes and messages this hour against the limits, AI spend against the cap, quiet hours, what the phone is doing now and the last problem.
- **My profile**: the AI's suggested photo order, bio and notes for your own profile.
- **Daily tally**: today and the six days before: swipes, likes, matches, messages sent, dates suggested. Its Openers tab counts the AI's first messages by kind and how many got an answer within 3 days.

The dashboard reads everything again every 4 seconds while the phone or the AI is busy, and every 15 otherwise.

## The Phone screen

`/admin/dating/phone`, under Dating: pairing, the "Date is in control" switch, Resume, the screen window, Take a picture, Unpair, what the phone did (walks and their steps with pictures) and the sample data.

## The Calendar screen

`/admin/dating/calendar`, under Dating: every agreed date on a month, the ones waiting for a time, and Google Calendar's state (`chats/dates-and-calendar.md`).

## Sample data

Add sample data on the Phone screen adds 12 cards and 7 chats: one with a draft waiting and two more to pick from, one flagged, one at five messages each way, a new match with the AI's first message waiting, a date she said yes to with its time, place, number and brief, warming up as it went, and a chat the AI read as over. Some carry facts. The pictures are simple drawings in `public/sample/dating/`, not photos of anybody. Samples are marked as samples, the AI never reads one, and every button on one says "This is a sample, so nothing was sent to a phone." or that the AI does not write for it. Facts, the note and the AI drafts here switch do save on a sample, because they reach neither the phone nor the AI. Remove sample data deletes only samples.
