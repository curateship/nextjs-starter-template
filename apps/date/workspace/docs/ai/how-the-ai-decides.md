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
- **Regenerate** writes it again, told not to repeat the draft it replaces.

## Automate

Off by default. On, a draft goes out by itself 10 to 90 minutes after their message, drawn at random, marked "AI" in the chat. Switching it off stops new sends and clears the send times of waiting drafts; a send already on the phone's list still goes.

## The Start/Stop loop

`src/server/dating/worker.ts`, one job on the shell's 15-second pass. While a phone runs:

1. Every ten minutes it reads the chat list, then each changed conversation.
2. With no card waiting it reads the card in front.
3. It waits for the AI's score, then likes or passes.

It ends at Stop, a hit hourly limit, a stop screen, the spend cap, the phone away for two minutes, a walk that failed, or Tinder having nobody new. Quiet hours pause it. Every pass also has the AI read new cards and draft replies whose newest message is theirs, whether or not the loop runs.

Slow work is started and not waited for, and each card or chat is claimed first, so two passes never pay for the same thing twice. The worker is proved with `src/server/dating/worker.test.ts`, never on the dev server's worker, which keeps old code running after edits.
