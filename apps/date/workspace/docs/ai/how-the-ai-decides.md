# How the AI decides

Date's AI is Claude Opus 5.5, named once in `src/server/dating/model.ts`, called through the shell's usage meter. Every call is checked against the monthly spend cap first (`spend.md`). Sample cards and chats are never sent to it.

## Reading a card

- **A score out of 100** for fit with what the member wrote they want, three lines in plain words, and red flags.
- **It sees the photos**, shrunk to 768 pixels on their long side, and every line read off the card.
- **Flags the card shows by itself**: no bio, one photo, outside the age range. **Flags only the AI can see**: photos that look generated, photos heavily filtered, further than the member wants (only when the member names a distance), and each dealbreaker it hits.
- **It never invents a fact** that is not on the card.
- **A card the AI will not read** scores 0 with "The AI would not read this card", and is passed.

## The swipe rule

No AI call. A score at or above the member's number is a like, below it a pass, and a card that hits a dealbreaker is always a pass.

## Drafting a reply

Tyler's rules, 17 Oct 2026, in his words where he gave them:

- "AI can craft messages and I will send it, but that should be an option if I want it automated later."
- **It never makes up facts about Tyler.** It uses only About me. A reply that needs a fact becomes a question on the dashboard; the answer is added to About me and it drafts again.
- **It never agrees a firm time or place without him.**
- **It never says it is an AI and never denies it.** Asked outright, it flags the chat and stops drafting there until he lets it again.
- **Nothing sexual.** A chat that turned sexual is flagged the same way.
- **The aim is a date.** Once both sides have sent 4 messages and it is going well, it suggests a drink or a coffee and offers his number; at 6 each, it does it now.
- **His voice**: his example messages set the base, the style dial nudges it. Under 200 characters, asked again once if longer. No emoji unless his examples use them.
- **Regenerate** writes it again, told not to repeat the draft it replaces. Show 3, Shorter, Funnier, Warmer and Tidy are in `../chats/chats-and-replies.md`.
- **A first message and one follow-up.** A new match whose card Date read gets a first message; a chat whose newest message is ours, unanswered for 3 days, gets one follow-up and never a second. Tyler's choices, 18 Oct 2026.
- **A scam is flagged, and a chat that is over is left alone.** Money, gift cards, crypto, a quick push to another app or a link flags the chat with no draft. Their saying no, that they are seeing someone, or goodbye marks the chat over with no draft; unmatching stays his.
- **It knows what they told you** and the member's note about that chat, and learns his voice from his own last 10 sends as well as his examples (`../chats/chats-and-replies.md`).

## Automate

Off by default. On, a draft goes out by itself 10 to 90 minutes after their message, drawn at random, marked "AI" in the chat. Switching it off stops new sends and clears the send times of waiting drafts; a send already on the phone's list still goes.

## The Start/Stop loop

`src/server/dating/worker.ts`, one job on the shell's 15-second pass. While a phone runs:

1. Every ten minutes it reads the chat list, then each changed conversation.
2. With no card waiting it reads the card in front.
3. It waits for the AI's score, then likes or passes.

It ends at Stop, a hit hourly limit, a stop screen, the spend cap, the phone away for two minutes, a walk that failed, or Tinder having nobody new. Quiet hours pause it.

Every pass, whether or not the loop runs, the AI also works through the member's matches in this order: new cards scored; chats with new messages from them read for notes (what they told you, and a yes to a date); answers where their message is newest; first messages for new matches; the one follow-up on chats quiet for 3 days; and the brief for each newly agreed date. A chat that is over, moved to text, taken over by the member, flagged or a sample gets none of it.

Slow work is started and not waited for, and each card or chat is claimed first, so two passes never pay for the same thing twice. The worker is proved with `src/server/dating/worker.test.ts`, never on the dev server's worker, which keeps old code running after edits.
