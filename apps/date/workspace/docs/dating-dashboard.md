# The Dating dashboard

`/admin/dating`, under Dating in the left menu. It is one dashboard in the Admin 3 panel design, the same pieces as the shell's Admin, CRM and Automations dashboards (`.agents/skills/Design/admin-3-panel-design/SKILL.md`), since task `../tasks/features/07-three-panel-design.md`. Tyler's rules, which outrank the code:

> "the left panel summarizes, middle is a list of all the leads and its status and right shows the profile and the chatbox is below it" (20 Oct 2026)
>
> "RIght panel always has something, it opens the first lead on the table or it remembers where I was" (20 Oct 2026)
>
> "Revamp the dating dashboard to the new 3 panel design patters" (18 Nov 2026)
>
> "This needs to be in header [the grey band with their photo, name and status] and the tabs to be subheader. THe left panel cog needs to be changed to a 3 dot dropdown and the modal needs to be a dropdown with the new dropdown ui" (18 Nov 2026)

> "move the start swiping button here [after Views in the list's header] and move the profile swicher inside the 3 dotted dropdown", then "fix the buttons ui" of the ⋮'s rows (18 Nov 2026)

The left panel's flat sections with no grey boxes, from the 20 Oct mock, gave way to the design's grey block cards on 18 Nov 2026 by Tyler's request.

- **Widths**: each side opens at its narrowest, as every three-panel screen does, and drags wider. The widths are kept in this browser, one set for the three panels and one for Overview's two.
- **Under 1280 pixels** one panel shows at a time, under the shell's pill row.
- **On arrival** the dashboard goes back to the open profile's last address in this browser: the section, the search, the filters, the sort and the open lead. With nothing remembered it opens Leads and its first lead. A remembered lead that has gone gives way to the first one. A link that already names a lead wins.

## A lead

A lead is one person: the card the phone read, and their chat once they match. A chat whose card Date never read is a lead of its own. `?open=` holds the card's id, and a chat's id opens the same lead. The rules are in `src/lib/dating/leads.ts`.

Each lead has one status:

- **New**: a card not swiped yet.
- **Liked** or **Passed**: a swiped card with no chat.
- **Matched**: a chat with no messages yet.
- **Chatting**: a chat with messages.
- **Date set**: they said yes to a date.
- **Over**: the AI read the chat as over, it was moved to text, or somebody unmatched. The grey line says which.

A lead **waits on you** when its chat has a draft you send yourself, a flag from the AI, or the AI's question about you. A draft that automate sends by itself waits on nobody.

## One profile at a time

The dashboard shows the open profile (`profiles.md`): its leads, phone, settings, page and spend, and nothing of the member's other profiles. The left header names it, and the ⋮'s Open profile row switches to another; the Profiles block lists every profile. Switching loads the page again, and each profile goes back to its own last place.

## Left: the page

The open profile's own page, one per profile, written on like any page in the design: words, the basic "/" blocks, and Date's own blocks (`dating-page-panel.tsx`, `dating-blocks.tsx`). It is kept in `date_pages` (`drizzle/0143_date_pages.sql`) and only its owner saves it. A page nobody has written on starts with today's sections as blocks, in this order.

- **The header**: the collapse button, the open profile (its photo or letter, its name, and its app and phone in a muted line), then the **⋮**.
- **Dashboards**, fixed: **Overview**, **Leads**, **Matches** and **Dates**, each with its count. Leads is every lead (over leads left out), Matches the leads with a chat, Dates the leads who said yes. The address keeps the row as `?tab=`. Its ⋮ hides a row or drags the rows into a new order, kept per profile; Overview stays first. It cannot be deleted, only moved up and down.
- **Needs you**: every lead waiting on you, each with what it needs ("Review draft", "Reply yourself" with a red dot), five then "Show all". Pressing one opens it.
- **Phone**: the phone's line, "Here, swiping, 42 of 150", "Away since 9:40", the Tinder screen that stopped it in red, or "No phone paired". Pressing it opens the phone on the right. A paused profile says "Paused. Nothing runs until Resume." here, with **Resume**.
- **Profiles**: every profile, its app, Paused, and how many leads wait on you there. The open one is picked; pressing another switches. **New profile** is under the rows.
- **Leads**: Waiting on you, New, Liked, Matched, Chatting and Date set, each with its dot and count. On a list it narrows the list in place, keeping the other filters; on Overview it opens Leads narrowed. Pressing the picked one again lets go.
- **Second Look**, on a Facebook Dating profile only: the cards the AI passed by 5 points or fewer under the like line in the last two weeks, each with its score (part 14 of `../tasks/facebook/01-facebook-dating.md`). Pressing one opens the card on the right, so the photos come before the like. **Like** on the row, or in the card's footer, has the phone open Facebook's Second Look and like them there. Nothing is liked without the press.
- **My profile**, not on a Facebook Dating profile: opens your own profile on the right (see "The phone and My profile").
- **Right-click** in the page opens the "/" list where the click was.

### The ⋮

The design's tabbed menu took the place of the cog's settings window. Four tabs:

- **General**: Cover photo (None, Sky, or a picture, which carries on behind the right panel's header), **Open profile**, which lists every profile and switches to the one picked, the profile's Name and Google Calendar. Under them **New profile** and **Pause profile** or **Resume profile**, then **Delete profile** in red under a line, and **Lock blocks** at the foot, all four starting at one edge. Locked, the page reads only at full strength and the server refuses a save.
- **You** and **Rules**: every Dating setting of the open profile, as grouped rows (`settings.md`).
- **Widgets**: Overview's two rows and which widget sits in each spot.

Coming back from Google Calendar's screen opens the ⋮ at General and says how it went.

## Overview

Overview's widgets sit straight on the dashboard, with no middle header and no right panel, in the shell's widget cards (`dating-overview.tsx`). Each widget's ⋮ has **Manage widgets**, which opens the left ⋮ at Widgets. An empty spot is pressed to put a widget there. The layout is kept per profile.

- **Today**: the day's swipes against the limit, likes, matches, messages sent and dates suggested, with **Profiles**, which has the phone read the card on Tinder's screen without swiping, and **Chats**, which has the phone read Tinder's chat list.
- **AI spend**: spent this month against the cap, cost per match and cost per date.
- **Last 7 days**: swipes, likes and matches each day.
- **Openers**: the AI's first messages by kind and how many got an answer within three days.
- **What's working**: liked cards by band of 10 points and how many matched.
- **Compare apps**, not placed to start: each profile's month side by side, matches out of 100 likes, replies, dates and the AI's dollars a match. When one app clearly does better, a line suggests moving hours, with **Change hours**, which opens the left ⋮ at Rules. It says "Shows once you have two profiles" until then.

The first visit lands on Leads, not Overview. A layout starts with Today and AI spend on top, then Last 7 days, Openers and What's working.

## Middle: every lead and its status

Leads, Matches and Dates share one list in the shell's table (`lead-list.tsx`).

- **The header**, left to right: the button that brings back a shut left panel, the row's icon and name, the "N selected" button while rows are ticked, the search box, **Select**, **Filter** and **Views**, then **Start swiping** (**Stop swiping** while the phone swipes) as the one dark button, then the button that brings back a shut right panel. In a narrow header its words drop and the icon stays. Overview has no header, so it has no Start.
- **The search** finds names and last lines.
- **Filter** holds the status (or Waiting on you), who swiped (you or the AI), the lowest score, **Show over** and **No samples**. Clear empties them. Save as view keeps them.
- **Views** are your own named filter sets, kept by the shell's saved views per profile.
- **The rows fold under headings**: Waiting on you, then New, Liked, Passed, Matched, Chatting, Date set, and Over (while Show over is on), each with its count. A lead waiting on you shows under Waiting on you only. Over starts folded. Sorting a column takes the headings away and shows one sorted list.
- **A row**: their first photo (the coloured letter when there is none, or once a passed card's photos were deleted after 30 days), name and age, a dot when something is unread, and the last line, the date's place, or what happened to the card. Then the status as a coloured pill, **Needs**, the score, who swiped and the last change. Columns drop away as the panel narrows, and the status moves under the name. The open row has the sliding bar.
- **Needs** says what the lead wants from you: "Review draft", "Reply yourself" in red when the AI flagged the chat, "Answer the AI", "Your call" in red for someone met on another profile, "Date Wed 7:00 PM" or "Set the time" for a date, and "-" for nothing.
- **A lead opens at once**: it is read while the pointer heads for its row, and that read is kept for half a minute.
- **Right-click** a row: **Mass select** ("Hide select" while on, and the row starts ticked), then for a chat **Read the chat again** and **Moved to text** (or Back on Tinder), then **Unmatch** in red after the shared confirm.
- **Mass select** shows tick boxes. The "N selected" menu offers **Moved to text** and **Clear dead** for the ticked chats. Clear dead unmatches only the ticked chats with no message either way for 30 days, after a confirm. Cards are never swiped together, because Tinder swipes only the card on the phone's screen.
- **A red line across the top** when a Tinder screen stopped the phone: the reason, "See what Tinder showed", and **Resume**.
- **No rows**: "No lead matches "x"." with **Clear filters**, or "Every lead is over." with **Show over**.
- **Keys**: the up and down arrows move through the rows as shown and open each lead. **L** likes and **P** passes the open lead while it is not swiped yet. Keys do nothing while you type in a box or on the left page.
- **Dates** has a month above the list, a month across the panel's width like Google Calendar (Tyler picked that on 21 Oct 2026). Each date with a time is written in its day, "7:00 PM Sofia", and pressing it opens that lead. The handle between the month and the list drags, and the split is kept in this browser (Tyler, 21 Oct 2026: "make the bottom panel draggable").

## Right: the person, the chat below

- **The header is the person** (Tyler, 18 Nov 2026: "This needs to be in header"): their photo or letter, name and age, when the card was read (and "sample"), and the status pill, then the lead's **⋮** and the collapse button. In a narrow panel the pill gives way to the name and the status moves into the muted line. The left page's cover carries on behind it.
- **The tabs are a row under it** ("and the tabs to be subheader"): **Chat** first for a lead with a chat, then **Profile** and **AI analysis**, drawn as Settings → Styling → Dashboard tabs says. Chat opens first (Tyler, 20 Oct 2026: "chat tab first"). The tab picked stays while other leads open, and a lead with no chat shows Profile when Chat was picked.
- **The lead's ⋮**: the lead's Status, Score, Swiped by and Last change as grouped rows, then Have the AI read the card again, Read the chat again from the phone, Moved to text or Back on Tinder, and **Unmatch** in red at its foot after a confirm.
- **The footer**, on a card not swiped yet: its status, **Pass** and **Like**. On a Second Look card: "Passed by the AI, score 64" and **Like**. A chat has no footer; its foot is the reply box.
- **There is no ×**: the right panel always shows a lead, the phone or My profile.

- **The Profile tab**: Before your date at the top once they said yes (their line, photos, when and where, their number and three lines from the chat, with Add to calendar, `chats/dates-and-calendar.md`). Then the photos with arrows, every line the app showed, the bio and the prompts. On Facebook Dating, under them: "You met Maya on Tinder (Tyler): you matched there" in a box when the same person was met on another profile, then "Liked you first, and wrote on your photo: …", "Facebook Dating's weekly surprise match", "Your like said: …" for the comment the AI sent with the like, "Liked from Second Look", the mutual friends and the groups you share, and the Instagram pictures, each opening full size. Then what they told you as small tags. Pressing a tag changes it, its × deletes it, and Add one adds one. Under them, who swiped the card and when, or a swipe on its way. An old pass says "Photos deleted after 30 days."
- **The AI analysis tab**: the score out of 100, "checked twice" when Opus looked again, its three lines, flags and dealbreakers. For a chat it adds the counts each way, whether a date was suggested, warming up or cooling off with why, and the AI's question with an answer box or its flag with "Let the AI draft here again". A Facebook chat flagged as a scam also has **Report and unmatch**, after the shared confirm, and says when it was reported.
- **In the Chat tab** a photo, voice note, sticker, video or GIF shows as "Sent a photo" and the like, in italics with a picture mark.
- **The Chat tab**: a line for each day, such as "Sun, 18 Oct". Theirs sit on the left in grey with the time under them, ours on the right in black with "You · 9:16 AM" or "AI · 9:16 AM", newest at the bottom, with what is still sending, unsure or not sent. A chat the AI read as over says so with Not over; one moved to text says so with Undo.
- **The foot of the Chat tab**, pinned while the chat scrolls, white boxes on a light grey band:
  - **The AI's draft**: "AI draft · 1 of 3" with **Next** to step through the three, **Use this** to put it in your box, and **Dismiss**. Dismiss drops the draft and its choices, and the AI writes no new one for the same message, so it cannot come straight back; a new message from them moves it on (`draft_dismissed_for`, migration 0106). With automate on, the time it goes out by itself.
  - **Your box**, "Write your own reply", three lines tall to start (Tyler: "the chat field needs to be 3 row"), with **Draft** (three new drafts), **Tidy** (your words in your voice, with Undo tidy), **Note** (the note to the AI about this chat, which saves as it is typed) and **Send from phone**. Words typed but not sent are still there after a look at another tab.
  - **AI drafts replies here**, the chat's own switch, and how many drafts are ready (`chats/chats-and-replies.md`).

The dashboard reads everything again every 4 seconds while the phone or the AI is busy, and every 15 otherwise.

## The phone and My profile

Tyler, 20 Oct 2026: "We dont need 4 seperate pages. Condense them all into the 3 col dashboard". The Phone, Calendar, Stats and My profile screens are gone, with their links under Dating in the left menu (`drizzle/0107_date_one_dashboard_menu.sql`).

- **The phone**, `?open=phone`, opens on the right from the Phone block (`phone-panel.tsx`), in the shell's record frame: the phone's name and where it is in the header, and a **⋮** with **Screen window**, **Picture**, **New code** and **Unpair** in red. Its cards:
  - **Phone**: its details (Tinder's and Facebook's versions among them), the stop and **Resume** after the app's screen stopped the open profile, the "Date is in control" switch, or **Pair a phone** with the pairing steps. A profile with no phone also lists the member's phones already paired for another profile, with **Use this phone**. A Facebook profile shows Facebook Dating's break.
  - **Swiping**: running since when and who started it, or why it stopped. Swipes today and this hour, messages this hour and the AI spend against their limits, what Tinder's own distance and ages were set to, what the phone is doing now and the last problem. On a Facebook profile, Facebook Dating's pace.
  - **What the phone did**: the walks and their steps, with pictures.
  - **Sample data**: add or remove it.
- **My profile**, `?open=me`, opens on the right from the My profile block (`my-profile-panel.tsx`): your own Tinder profile as the phone last read it, with **Read it again** and **Review again** in its ⋮; the AI's suggested photo order, bio and prompt answers, each with Before, After and Apply; and the first-photo test. See `your-profile.md`.
- **Coming back** to the dashboard reopens the phone or My profile too, if either was open. Opened from Overview, either goes to Leads, which has a right panel.

## Sample data

Add sample data, in the phone's panel, adds 12 cards and 7 chats (a Facebook Dating profile gets more, below): one with a draft waiting and two more to pick from, one flagged, one at five messages each way, a new match with the AI's first message waiting, a date she said yes to with its time, place, number and brief, warming up as it went, and a chat the AI read as over. Some carry facts. The pictures are simple drawings in `public/sample/dating/`, not photos of anybody. Samples are marked as samples, the AI never reads one, and every button on one says "This is a sample, so nothing was sent to a phone." or that the AI does not write for it. Facts, the note and the AI drafts here switch do save on a sample, because they reach neither the phone nor the AI. Remove sample data deletes only samples.

On a Facebook Dating profile the samples also have Facebook's extras (part 8): Mila, who liked you first with "Okay but which bakery is the best one?" and is on Likes you; Clara, who liked you first with a comment her opener answers; Zoe, with 2 mutual friends, a shared group and an Instagram picture; Ruth, met on your other profile and matched there, so she is Your call; Lena, a near miss on Second Look; Tess, Facebook's weekly surprise match with a first message waiting; Rosa, who asked to FaceTime; Vera, a scam with Report and unmatch; and a photo in Maya's chat.
