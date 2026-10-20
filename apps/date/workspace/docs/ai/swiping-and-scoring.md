# Swiping and scoring

How the score learns from the member, what it costs, when swiping runs, and what it is getting him. Tyler's decisions of 18 Oct 2026 are at the top of `../../tasks/features/02-swiping-and-scoring.md`, and they outrank this file and the code.

## Learning from the member's swipes

- **An overruled card** is one the member liked when the rule would pass it, or passed when it would like it. The like line as it is now decides, so moving the line changes which cards count.
- **The AI sees the last 10** each time it scores a card, as their short read, their score and "the member liked it" or "passed it". No photos, to keep the cost down, about a cent a card more (`overruledCards` in `src/server/dating/ai.ts`).
- **Left out**: cards the AI swiped, cards it would not read, people on the People I know list, and samples.
- **The Swiping card says** "Learning from 7 of your swipes".

## Two looks at a card

- **Sonnet 5.5 scores every card first.** Opus 5.5 scores it again only when Sonnet's score is within 10 of the like line, 60 to 80 with the line at 70. Opus's answer then counts, and Sonnet's is dropped.
- **Both calls go through the meter** and count toward the cap. The cap is checked again before the second look; a cap reached in between leaves the card to be read later, rather than deciding it on Sonnet's score.
- **Which model's score counts** is kept on the card (`ai_model`). A card Opus looked at says "checked twice" beside its score. Cards read before 20 Oct 2026 were all Opus alone and say nothing.

## People I know

- **Settings → Dating, one a line**: a name and an age, such as "Sarah, 31".
- **A card with that name and age is passed** without an AI call, with the read "Someone on your People I know list." and the flag "On your People I know list". The name matches whatever its capitals or accents, so "Zoë" is "zoe".
- **A stranger with the same name and age is passed too.** Photos and faces are not compared.

## Super Likes

- **A card scoring 95 or more gets a Super Like** instead of a Like, at most one a day on the phone's clock. It is stored as the swipe "super" and counts as a like everywhere else.
- **One try a day.** When Tinder says the free Super Likes are gone and offers to sell more, the walk shuts the offer through "No thanks" or back, likes the card instead, and records a like. That try still counts as the day's, so the offer is met once a day at most. Nothing on the offer is ever pressed but a way out.

## The swiping schedule

One window every day, set in Settings → Dating as "Swipe every day from" and "Until", on the phone's own clock. Empty means no schedule.

- **Inside the window the schedule starts the loop once**, when the phone is here, paired, in control, not stopped on a Tinder screen, and the cap has room. The Swiping card says "started by the schedule".
- **It never resumes a stop screen.** Out of likes, a ban and the rest still need Resume.
- **An hour's swipes running out** ends the loop as before, and the schedule starts it again once the limit allows, inside the window. A phone that went away gets it started again once it is back.
- **Anything else that ends it holds until the next day**: Stop pressed inside the window, a failed walk, Tinder having nobody new, the daily limit, the cap.
- **At the window's end** the schedule stops any loop that started inside the window, by the schedule or by hand, saying "Schedule: swiping ends at 22:00". A loop started by hand outside the window is left alone.
- The state is on `date_phones`: who started the loop, the window the schedule last started or Stop held, and when a limit allows it again (`scheduleStep` in `src/server/dating/worker.ts`).

## Tinder's own filters

- **Furthest away**, 25 km to start with, sits beside the ages in Settings → Dating. The phone copies it and the age range into Tinder's own settings, so Tinder stops showing cards Date would pass anyway.
- **It runs** once for every phone, again whenever the distance or an age changes, and on Resume, as soon as the phone is free and outside quiet hours. A walk that fails is not tried again by itself: change a setting or press Resume.
- **The walk drags each slider and reads it back** until it says what Date asked for, aiming again by how far each move missed. Tinder counting in miles gets miles (25 km is 16 miles). A value past the end of Tinder's slider is set to its end.
- **The Swiping card shows what Tinder was set to**, and when, or why it failed.
- **Not checked on a real phone yet.** The settings screen's labels and the slider ends are guesses (`walks.md`).

## Forgetting passed photos

- **30 days after a pass, the card's photos are deleted** from R2 and its photo list emptied, once a day. The name, age, score and read stay, and the card says "Photos deleted after 30 days."
- **Kept**: passes the member made against the AI, every like, samples, and any photo another card, a match or the member's own profile still uses.
- A photo R2 will not delete stays on its card and is tried again the next day.

## What's working

- **A tab on the Daily tally card**: every liked card the AI scored, in bands of 10 points, with how many became a match and how many of those matches sent a message. For example, "80 to 89: 9 matches out of 40 likes, 5 replied".
- **A band with fewer than 20 likes** says "not enough yet". It needs a few weeks before the numbers mean anything.
- **A match is tied to its card** when the like came back "It's a Match!", or later by name on the chat list, to the newest like of that name not already tied to a match.

## What a match costs

- **The Swiping card shows this month's AI spend per match and per date**, such as "$4.20 for 3 matches, $1.40 a match". A month with none says "no matches yet" instead of dividing by zero.
- **This month** is the meter's own, from the 1st in UTC. Matches count by when they matched, dates by when they said yes. Samples are left out.
- **The dollars are estimates** until a real AI call goes through (`spend.md`).
