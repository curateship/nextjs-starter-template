# The Dating dashboard

`/admin/dating`, under Dating in the left menu. It is a three-column dashboard built from the shell's own pieces (`docs/shell/three-column-dashboards.md` in the repo), laid out by Tyler's rule of 20 Oct 2026, which outranks the code:

> "the left panel summarizes, middle is a list of all the leads and its status and right shows the profile and the chatbox is below it"
>
> "RIght panel always has something, it opens the first lead on the table or it remembers where I was"

- **Widths**: left 22 out of 100, middle 54, right 24. Each side drags shut and comes back from a tab on the middle's edge, a double-click on blank space shuts it, and the widths are kept in this browser.
- **Under 1280 pixels** one panel shows at a time, under three pills: Leads, Summary and Lead. Pressing a lead switches to Lead.
- **How it looks** follows Tyler's mock of 20 Oct 2026, `assets/pasted-image-1792550342758871000.png`, with the right panel's light grey bands from `assets/pasted-image-1792551008786131000.png`.
- **On arrival** the dashboard goes back to the open profile's last address in this browser: the tab, the search, the filters, the sort and the open lead. With nothing remembered it opens the first lead in the list. A remembered lead that has gone gives way to the first one. A link that already names a lead wins.

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

The dashboard shows the open profile (`profiles.md`): its leads, phone, settings and spend, and nothing of the member's other profiles. The left panel's title is the profile picker, and the Profiles section lists every profile. Switching loads the page again, and each profile goes back to its own last place.

## Left: the summary

Flat sections split by lines, with no grey boxes (`flat-section.tsx`, copied from Video's Viral project). Each folds, and its arrow shows on hover.

- **The title** is the open profile, with its photo or letter; it opens the list of profiles and New profile. A paused profile's line comes first, with Resume.
- **The phone's line**: a dot and "No phone paired" with **Pair one**, or "Phone here · swiping", "Away since 9:40", or the Tinder screen that stopped it, with **Phone**. Both buttons open the phone in the right panel.
- **Profiles · 2**: every profile, its app and phone, a Paused tag, and how many leads wait on you there. Pressing another switches to it; the New profile row under them makes one.
- **Today · 42 of 150 swipes**: a bar of the day's swipes against the limit, then likes, matches, messages sent and dates suggested. Under them **Start** (Stop while running), **Profiles**, which has the phone read the card on Tinder's screen without swiping, and **Chats**, which has the phone read Tinder's chat list.
- **AI spend · this month**: spent against the cap, cost per match and cost per date.
- **Leads · 11**: Waiting on you, New, Liked, Matched, Chatting and Date set, each with its coloured dot and count. Pressing one shows those leads in the middle; pressing it again shows every lead. The 11 leaves over leads out.
- **The cog** in the header opens the open profile's Dating settings in a window, with Pause and Delete in its foot.
- **Second Look · 1**, on a Facebook Dating profile only: the cards the AI passed by 5 points or fewer under the like line in the last two weeks, best first, never one a rule passes whatever the score (a dealbreaker, People I know, 3 or more mutual friends, passed on another profile), each with its score and **Like** (part 14 of `../tasks/facebook/01-facebook-dating.md`, Tyler's "You decide"). Like has the phone open Facebook's Second Look, find them and like them; the AI's pass becomes the member's like. Nothing is liked without the press.
- **Last 7 days**, **Openers** and **What's working** follow.
- **Compare apps · this month**, for a member with two or more profiles: each profile's app and name, matches out of 100 likes (or "not enough yet" under 20 likes), how many matches replied, dates agreed and the AI's dollars a match (part 23). When two profiles both have 100 likes this month and one gets at least 1.5 times the other's matches out of 100, and 2 more, a line suggests moving hours, such as "Facebook Dating made 9 matches out of 100 likes this month, Tinder 4. Give Facebook Dating more hours?", with **Change hours**, which opens the settings window (part 24), shown only when the suggestion is about the open profile, because the window holds its hours. Nothing changes by itself.
- **My profile** with Open comes last (see "One dashboard, no separate pages"). A Facebook Dating profile has none: Date does not change a Facebook Dating profile (left out on 22 Oct 2026).
- **Today's limit** is the one that really applies: on Facebook Dating never over 50 swipes a day, whatever the settings say.

## Middle: every lead and its status

- **Tabs**: All, Matches (leads with a chat) and Dates (leads who said yes), each with a count.
- **The toolbar**, left to right: the "N selected" button while rows are ticked, the search, **Filter** and **Views**. Ask Date is not on the mock, so it left the screen.
- **The search** finds names and last lines.
- **Filter** holds the status (or Waiting on you), who swiped (you or the AI), the lowest score, **Show over** and **No samples**. Clear empties them. Save as view keeps them.
- **Views** are your own named filter sets, kept by the shell's saved views as the `dating` screen.
- **The table**: the lead (a round letter, name and age, a dot when there is something unread, and the last line, the date's place, or what happened to the card), the status as a coloured pill, **Needs**, the score, who swiped and the last change. Columns drop away as the panel narrows, and the status moves under the name.
- **Needs** says what the lead wants from you: "Review draft" for a draft you send yourself, "Reply yourself" in red when the AI flagged the chat, "Answer the AI" when it has a question about you, "Your call" in red for someone met on another profile who matched or chatted there (the AI leaves Like and Pass to you), "Date Wed 7:00 PM" or "Set the time" for a date, and "-" for nothing.
- **The grey line** under a Facebook lead says "Liked you first" for someone from Likes you not swiped yet, "Weekly surprise match" for Facebook's weekly match before anyone writes, and "Met on another profile" for a Your call lead.
- **Status colours**: Chatting green, Matched blue, Date set black, New grey, and Liked, Passed and Over faded (`lead-status-style.ts`).
- **The order**: leads waiting on you first, then the newest change. A sorted column replaces that order. Over leads stay out until Show over or the Over status is picked in Filter.
- **A red line across the top** when a Tinder screen stopped the phone: the reason, "See what Tinder showed", and **Resume**.
- **Keys**: the up and down arrows move through the list and open each lead. **L** likes and **P** passes the open lead while it is not swiped yet. Keys do nothing while you type in a box.
- **Mass select**, the chip beside the Lead heading, shows tick boxes. The "N selected" menu offers **Moved to text** and **Clear dead** for the ticked chats. Clear dead unmatches only the ticked chats with no message either way for 30 days, after a confirm, and leaves the rest. Cards are not swiped together, because Tinder swipes only the card on the phone's screen and refuses any other.

## Right: the profile, the chat below it

Tyler, 20 Oct 2026:

> Put profile and ai into its own tab. Ai tab to be called "Ai analyzed" wire the tabs to the styling setting
>
> dont need the chat in ai tab
>
> put profile on its own trab
>
> chat tab first

- **The header**: three tabs, **Chat** first for a lead with a chat, then **Profile** and **AI analysis**, drawn as pills or underlined as Settings → Styling → Dashboard tabs says for the whole site. The mock renamed "Ai analyzed" to "AI analysis". Then a "…" menu, and no ×. The "…" menu has the AI read the card again, has the phone read the chat again, moves the chat to text or back, and unmatches after a confirm. Chat opens first. The tab picked stays while other leads are opened, and a lead with no chat shows Profile when Chat was picked.
- **The mini profile**, under the tabs on a light grey band: their round letter, name and age, when the card was read, and the status pill. **Pass** and **Like** sit under it while the card is not swiped, except on Facebook's weekly match, which is a match already. It stays put while the tab below scrolls.
- **The Profile tab**: Before your date at the top once they said yes (their line, photos, when and where, their number and three lines from the chat, with Add to calendar, `chats/dates-and-calendar.md`). Then the photos with arrows, every line the app showed, the bio and the prompts. On Facebook Dating, under them: "You met Maya on Tinder (Tyler): you matched there" in a box when the same person was met on another profile, then "Liked you first, and wrote on your photo: …", "Facebook Dating's weekly surprise match", "Your like said: …" for the comment the AI sent with the like, "Liked from Second Look", the mutual friends and the groups you share, and the Instagram pictures, each opening full size. Then what they told you as small tags. Pressing a tag changes it, its × deletes it, and Add one adds one. Under them, who swiped the card and when, or a swipe on its way. An old pass says "Photos deleted after 30 days."
- **The AI analysis tab**: the score out of 100, "checked twice" when Opus looked again, its three lines, flags and dealbreakers. For a chat it adds the counts each way, whether a date was suggested, warming up or cooling off with why, and the AI's question with an answer box or its flag with "Let the AI draft here again". A Facebook chat flagged as a scam also has **Report and unmatch**, after the shared confirm, and says when it was reported.
- **In the Chat tab** a photo, voice note, sticker, video or GIF shows as "Sent a photo" and the like, in italics with a picture mark.
- **The Chat tab**: a line for each day, such as "Sun, 18 Oct". Theirs sit on the left in grey with the time under them, ours on the right in black with "You · 9:16 AM" or "AI · 9:16 AM", newest at the bottom, with what is still sending, unsure or not sent. A chat the AI read as over says so with Not over; one moved to text says so with Undo.
- **The foot of the Chat tab**, pinned while the chat scrolls, white boxes on a light grey band:
  - **The AI's draft**: "AI draft · 1 of 3" with **Next** to step through the three, **Use this** to put it in your box, and **Dismiss**. Dismiss drops the draft and its choices, and the AI writes no new one for the same message, so it cannot come straight back; a new message from them moves it on (`draft_dismissed_for`, migration 0106). With automate on, the time it goes out by itself.
  - **Your box**, "Write your own reply", three lines tall to start (Tyler: "the chat field needs to be 3 row"), with **Draft** (three new drafts), **Tidy** (your words in your voice, with Undo tidy), **Note** (the note to the AI about this chat, which saves as it is typed) and **Send from phone**. Words typed but not sent are still there after a look at another tab.
  - **AI drafts replies here**, the chat's own switch, and how many drafts are ready (`chats/chats-and-replies.md`).

The dashboard reads everything again every 4 seconds while the phone or the AI is busy, and every 15 otherwise.

## One dashboard, no separate pages

Tyler, 20 Oct 2026: "We dont need 4 seperate pages. Condense them all into the 3 col dashboard". The Phone, Calendar, Stats and My profile screens are gone, with their links under Dating in the left menu (`drizzle/0107_date_one_dashboard_menu.sql`). Their addresses now say the page was not found.

- **The phone**, `?open=phone`, opens in the right panel from the phone's line in the left panel (`phone-panel.tsx`). In flat sections:
  - **Phone**: here or away and its details (Tinder's and Facebook's versions among them), the stop and **Resume** after the app's screen stopped the open profile, the "Date is in control" switch, **Screen window**, **Picture**, **New code** and **Unpair**, or **Pair a phone** with the pairing steps. A profile with no phone also lists the member's phones already paired for another profile, with **Use this phone**. A Facebook profile shows "Facebook Dating's break: on, so nobody sees your profile", "off, so your profile shows" or "not read by the phone yet", and in red when it is not what Pause or Resume asked for, with why when the phone said.
  - The Swiping section adds Facebook Dating's pace on a Facebook profile: at most 50 swipes a day and 20 an hour, 8 to 20 seconds apart.
  - **Swiping**: running since when and who started it, or why it stopped. Swipes today and this hour, messages this hour and the AI spend against their limits. How many of your swipes the AI learns from, what Tinder's own distance and ages were set to, what the phone is doing now and the last problem. The rules themselves are in the cog's settings.
  - **What the phone did**: the walks and their steps, with pictures.
  - **Sample data**: add or remove it.
- **My profile**, `?open=me`, opens in the right panel from My profile at the foot of the left panel (`my-profile-panel.tsx`): your own Tinder profile as the phone last read it, with Read it again and Review again; the AI's suggested photo order, bio and prompt answers, each with Before, After and Apply; and the first-photo test. See `your-profile.md`.
- **Stats** moved into the left panel as three folding sections: Last 7 days (swipes, likes and matches each day), Openers (the AI's first messages by kind and how many got an answer within three days), and What's working (liked cards by band of 10 points and how many matched). What a match and a date cost is in AI spend.
- **The calendar** is on the Dates tab, a month across the middle panel's full width like Google Calendar (Tyler picked that on 21 Oct 2026 over a stretched date picker). Weeks start on Monday, as in Project's calendars. Each date with a time is written in its day, "7:00 PM Sofia" (the name alone on a phone), and pressing it opens that lead. It opens on the month of the next date, with arrows and Today to move. The list of dates sits under it, and the handle between them drags to give either more room (Tyler, 21 Oct 2026: "make the bottom panel draggable"); the split is remembered in that browser. The handle is the line between them. Google Calendar's connection is in the cog's settings.
- **Coming back** to the dashboard reopens the phone or My profile too, if either was open.
- **The cog** in the left header opens every Dating setting in a window (`dating-settings-dialog.tsx`; Tyler: "all the settings needs to be in this cog modal"). They are only there, not in Settings, because they will differ per profile once there is a Profiles dashboard. A change saves as it is made, and the page header says Saving… and Saved.
- **There is no ×** on the right panel (Tyler, 20 Oct 2026); it always shows a lead, the phone or My profile.

## Sample data

Add sample data, in the phone's panel, adds 12 cards and 7 chats (a Facebook Dating profile gets more, below): one with a draft waiting and two more to pick from, one flagged, one at five messages each way, a new match with the AI's first message waiting, a date she said yes to with its time, place, number and brief, warming up as it went, and a chat the AI read as over. Some carry facts. The pictures are simple drawings in `public/sample/dating/`, not photos of anybody. Samples are marked as samples, the AI never reads one, and every button on one says "This is a sample, so nothing was sent to a phone." or that the AI does not write for it. Facts, the note and the AI drafts here switch do save on a sample, because they reach neither the phone nor the AI. Remove sample data deletes only samples.

On a Facebook Dating profile the samples also have Facebook's extras (part 8): Mila, who liked you first with "Okay but which bakery is the best one?" and is on Likes you; Clara, who liked you first with a comment her opener answers; Zoe, with 2 mutual friends, a shared group and an Instagram picture; Ruth, met on your other profile and matched there, so she is Your call; Lena, a near miss on Second Look; Tess, Facebook's weekly surprise match with a first message waiting; Rosa, who asked to FaceTime; Vera, a scam with Report and unmatch; and a photo in Maya's chat.
