# Chats and replies

What the AI does in a conversation beyond answering the newest message, and what the member can do to a chat from the dashboard. Built 18 Oct 2026 from `../../tasks/features/01-chats-and-replies.md`, whose top lists Tyler's choices. Agreed dates are in `dates-and-calendar.md`.

## What the AI writes

- **An answer** when their message is the newest, as before (`../ai/how-the-ai-decides.md`).
- **A first message** for a new match nobody has written to, once Date has read their card. It picks something specific off the card: a prompt answer, a photo, a song. It never writes a plain hey. Each opener is tagged by kind (a question about their profile, a comment on a photo, a joke, a simple hello, something else) so the Openers tab can count them.
- **One follow-up** on a chat where the member's last message has had no answer for 3 days. Never a second one in the same chat, even after a week.
- **Nothing** in a chat that is over, moved to text, taken over by the member, unmatched, or flagged.

The automate switch decides how each one goes out, the same for all three. Off, it waits for Send. On, it goes 10 to 90 minutes later: after their message for an answer, after the match for a first message, and after the draft for a follow-up.

## What the AI notices

- **A chat that is over.** When their newest messages say no, that they are seeing someone, that they are not interested, or goodbye, the AI writes no draft. The chat shows "The AI read this chat as over" with their line, and it sinks to the bottom of the Matches list marked Done. **Not over** lets the AI draft there again. Unmatching stays by hand, as Tyler chose.
- **A scam.** A request for money, gift cards, crypto or bank details, a push to WhatsApp, Telegram or another app in the first few messages, or a link, flags the chat with no draft, the same way the bot and sexual flags work. "Let the AI draft here again" clears it.
- **They unmatched you.** When a read of the chat list reaches the bottom and a chat with messages is not in it, that counts as one miss. Two complete reads in a row that miss it mark the match "They unmatched". The chat and its history stay, and the AI stops. A read that did not reach the bottom counts nothing. A new match with no messages is never counted, because it sits in the row across the top, which the walk does not read to its end. The task first said to open the chat by name before marking it. That would search the same list a third time, so two complete misses are the rule. A chat marked this way that shows up in a later read was read wrong: it is put back as it was, never made into a second match.

## What they told you

After new messages from them, one small AI call reads the chat for facts they said about themselves, such as a job, a pet's name or weekend plans, and keeps them on the match. The same call notices a yes to a date (`dates-and-calendar.md`). It runs once per new message from them: a call that fails is not tried again until they write again, so a broken key or a bad answer never costs on a loop.

- **The card shows them** on the right, under What they told you. Each one can be changed or deleted, and the member can add their own.
- **A fact the member wrote or changed is theirs.** The AI never overwrites it.
- **A deleted fact stays deleted.** It is kept hidden, so the AI knows not to read it back off the chat.
- **Drafts get the list**, so a reply can use what they said. A chat keeps 40 facts at most.

## The reply box

- **Show 3** writes three different drafts at once. The first is the draft; the other two show under it to pick from. Automate only ever sends the first.
- **Shorter, Funnier and Warmer** write the draft again in that direction.
- **Tidy** puts the member's own rough words in their voice, keeping every fact and what they meant. The tidied words go back in the box to read before Send, and **Undo tidy** puts the member's own words back. Nothing is saved or sent by Tidy.
- **"17 of your last 20 drafts sent unchanged"** sits at the bottom of the card. It counts the member's last 20 sends that began as the AI's draft, or one of its three choices, and how many went out word for word. It only shows the number; Tyler chose never to have it say "ready".

## The member's voice from what they send

Settings → Dating → "Also learn from my last 10 sent messages", on to start with. The member's last 10 messages that were their own words, from other chats, join the pasted examples in the drafting prompt. Their own words means typed with no draft, or a draft they changed. Left out: the AI's messages, drafts sent unchanged, one-word messages and anything with a phone number.

## This chat

- **AI drafts here**, on by default. Off, the AI writes nothing in that chat and a waiting draft is cleared with its send time, so automate cannot send it. The chat stays on Tinder.
- **A note to the AI** about this chat only, such as "slow down" or "she's moving in March". It saves by itself as it is typed. The AI follows it in that chat, and never over the four never-rules or the scam and over rules.
- **Moved to text**, the icon in the conversation's header. The AI stops, the chat sinks below the live ones, and the chat and its facts stay. Undo puts it back.

## Warming up or cooling off

Worked out without the AI from their messages: how long they are, and how soon they came after ours. Their first three are set against their last three. Fewer than 6 messages from them is "Too early to tell". The rule is in `src/lib/dating/chat-trend.ts`.

- **Warming up**: messages at least a quarter longer, or answers at least half again as fast, without the other getting much worse.
- **Cooling off**: the same the other way.
- **The times are when Date saw each message**, not when Tinder says it was sent, because a chat read off the phone carries no times. The speed half only counts with at least four answers to compare.
- **It shows** as a line in What the AI thinks, and as an arrow in the Matches list for warming or cooling.

## Ask Date

The box at the top of the Matches tab. A question such as "who said they like hiking?" goes to the AI with each live match's name and facts, never whole chats. The answer lists the matches with one line each; one click opens the chat. Sample chats and deleted facts are never searched.

## Clear dead matches

The button beside Read chats. A dead match has had no message from either side for 30 days, or matched 30 days ago with no message at all. Matches that are over, moved to text, unmatched or samples are left out. A confirm lists every name. Then one unmatch per match goes on the phone's list, in one request, and the phone runs them one at a time. A match that came back to life since the list was shown is skipped and counted.

## Which openers work

The Openers tab on the Daily tally card counts the AI's first messages by kind, and how many got an answer within 3 days, such as "A joke: 6 of 10 replied". It needs a few dozen openers before the numbers mean much, and says how many it is based on. Sample chats are left out.

## Where it lives

- The AI: `src/server/dating/ai.ts` (`draftReply` with its modes, `tidyReply`, `readChatNotes`, `askAboutMatches`), prompts in `src/server/dating/prompts/`.
- The pass: `src/server/dating/worker.ts`, notes first, then answers, openers and follow-ups.
- The member's actions: `src/server/dating/chats.ts`, server functions in `src/lib/api/dating/chats.ts`.
- They unmatched: `saveChatList` in `src/server/tinder/store.ts`.
- Columns: `drizzle/0100_date_chats.sql`.
- Tests: `src/server/dating/chats.test.ts`, and the unmatch walk in `src/server/tinder/walks.test.ts`.
