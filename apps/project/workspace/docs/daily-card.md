# The Daily card

The Daily card sits at the top of My dashboard's left panel, above every other
card, for everyone. It works like a personal assistant. It greets the person,
draws a sky for the time of day, and shows what to work on and what's next.
The site admin's card also holds their habits, streaks and a short journal,
and nobody else ever sees those. Tyler asked for it on 29 Oct 2026. His
answers are in [What this app is](what-this-app-is.md) under "Choices for the
Daily card", and that file wins wherever the two disagree.

## One card, the same for everyone

- **Where it is.** It is part of the left panel of My dashboard, not a card
  inside it ("more of a permanent fixture like how we built project avatar
  and background"). The sky lies faintly behind the panel's header and fades
  into the panel, the way a project's banner does. On an employee's page the
  greeting sits under the header with the day's parts below it, above the
  other cards (`my-dashboard.tsx`).
- **The site admin's is a block on their own page** since 6 Nov 2026: "/"
  then "Daily card", placed wherever they like on the page, once (Tyler:
  "make it the same as the habits and greeting card in the footer (and
  remove the footer card)"). For that one day it sat in the left panel's
  footer. The whole card is in the block: greeting, Start day, the habits
  and the rest, and Rate your day at night. The sky stays behind the header
  (`notes/dashboard-blocks.tsx`, `frame` on `DailyCard`). See
  [On their page, as blocks](#on-their-page-as-blocks).
- **The greeting folds the card**, on an employee's page and in the site admin's block, and the date and weather line folds away
  with it, so a folded card is the greeting alone (Tyler, 6 Nov 2026: "the
  date should be inside when collapsed"; `fold-heading.tsx`). Both pages draw
  `DailySkyBanner` and `DailyCard` from
  `daily-card.tsx`. It loads with the page (`loadDailyCard`,
  `src/server/project/daily-card.ts`).
- **Each section with a heading folds**: pressing the heading, or the arrow
  that shows while it is pointed at, folds it down to its heading, and this
  browser remembers it ("Add collapsible to the cards in my daily card").
  In My settings only Retired habits folds (Tyler, 6 Nov 2026: "we don't
  need toggles if its not required").
- **Each part sits on its own light gray box with a border**, drawn like the
  panel's other cards, such as the next meeting, the routine and
  tomorrow ("It looks too busy with all the sections, we need to clean it
  up. try putting them in light gray bg", then "the daily section cards is
  missing border"). The buttons sit on the panel itself
  (`daily-section.tsx`).
- **There is no pencil** since 6 Nov 2026. Everything it held is in My
  settings, behind the ⋮ in the panel's header. **The fold arrow** sits beside the greeting and
  shows only while the greeting is pointed at ("the good morning toggle icon
  shoukld only appear on hover over"), or on a phone, always.
- **The parts of the day follow each person's own hours.** Morning starts at
  5 AM, afternoon at 12 PM and night at 6 PM until the person changes them
  in My settings. Night runs past midnight until morning starts,
  in the person's own zone. Morning has to start before afternoon, and
  afternoon before night.
- **The card's day.** Before morning starts it is still last night on the
  card. A night habit ticked at 1 AM counts for the evening before, and
  Rate day pressed at 12:30 AM lands on that evening too. Tasks and meetings
  still use the calendar day.
- **The greeting.** "Good morning Tyler, it's Thursday", then "Good afternoon
  Tyler", then "Good evening Tyler, time to wind down". After midnight it
  reads "Still up Tyler? Time to rest". It uses the first name only, and
  leaves the name out when there is none.
- **The sky.** It is a drawing: a sunrise for the first hour of the morning,
  blue sky, gold for the last 90 minutes of the afternoon, a sunset for the
  first hour of the night, then stars (`daily-sky.tsx`). It is drawn faint,
  so the header and greeting read in their usual colours over it. The sky
  stays while the site admin's inbox or Look back is open in the panel ("the
  panel background image should not disapeared when i click on the graph or
  the inbox tab").
- **The weather.** A City field in My settings → General, behind the ⋮
  beside the name. The card's sky then shows that city's weather, such as clouds, rain,
  snow or fog, and "12°, rain in Toronto" under the greeting. The browser
  never asks where the person is. The weather comes from Open-Meteo, which
  is free and needs no key. Each place's weather is kept for 30 minutes. If
  the service doesn't answer, the sky follows the clock alone and nothing
  shows an error. A city it can't find is refused with "We couldn't find
  that city".
- **The next meeting.** "Standup in 25 minutes", then "Standup now" while it
  runs, or "Standup at 3:00 PM" when it is more than an hour off. An
  employee sees the meetings they're invited to. The site admin sees every
  team's. A meeting someone said Not going to is left out.
- **Check-in nudge.** Before an employee has checked in today, morning and
  afternoon, the card says "Check in to plan your day", which opens the
  check-in window.
- **Check-out.** At night, an employee who checked in and hasn't checked
  out sees "Check out and plan tomorrow".
- **Taken out on 3 Nov 2026.** Tyler: "remove the "today I want to", line
  of the day, Done today, at night and Afternoon progress, your own line and
  your own night questions feature". The card has no line for the day, no
  afternoon count of what got done, no Done today list at night, no Today
  or Tomorrow I want to..., no night question, and no On this day. Then:
  "remove the deep work card feature too", so it has no Deep work list of
  tasks with Start either. Their columns were dropped in `drizzle/0143_project_daily_card_trimmed.sql`.
- **Day off.** On the person's own time off, the card reads "Enjoy your day
  off". On a team holiday it reads "Enjoy Christmas Day". It shows no next
  meeting and no check-in nudge that day. The site admin is on no team, so
  their day off is their own time off, or a holiday every team has that day.
- **Fold it.** Pressing the greeting or its date line folds everything below
  it away, and pressing it again opens it ("clicking on the text area should
  uncollpase it"); the arrow beside it does the same.
  This browser remembers it, like the other cards.
- **On a phone** the site admin's My dashboard opens on the Me tab, with
  their page and its Daily card block. An employee's still opens on My tasks.

## The site admin's own parts

Only the site admin has these ("The habits is admin only"). Every function
that reads or writes them refuses anyone else, and none of it is ever shown on
a team screen or sent to anyone.

### Routines

- **Three lists of habits: morning, afternoon and night.** The card's habits
  section shows every habit set for today at any time of day, morning's
  first, then afternoon's and night's ("show all habits and not just morning
  or afternoon"), with a tick for each. The section is named after its first
  part, "Morning", rather than "Today's habits", and afternoon's and night's
  habits start under a small "Afternoon" or "Night" label ("Add afternoon and
  night label to separate them ... dont need morning", then "Change the
  "Today's habit" to "Morning""). In a narrow left panel a habit's name
  keeps room for a few words and its streak chip, count and "+" drop to the
  next line, the way the project page's left panel wraps rather than cutting
  things off ("The project dashboard doesnt have this problem. Why dont you
  copy project dashboard pattern"). That first name is written like the labels,
  not in capitals as other section headings are ("Morning is all cap. Make
  it the same as the other time"). It reads "Today's habits" only while no
  habit is set for today. Ticks start again each card day.
- **Each part's starting hour.** Beside Morning, Afternoon and Night the card
  shows the hour that part starts in Your hours, "Morning - 5:00 AM" ("put
  the time beside the labels", then "the your hour should replace the hour
  beside the labels"). Afternoon's and Night's labels have 20px above them and
  8px below, so each part reads as its own group (Tyler, 2 Nov 2026: "add
  some spacing here"). The site admin sets those hours in Routine habits,
  at the right of each part's name with a clock ("put the hours selection
  beside the label"). An employee, with no habits, sets them under Your hours
  in My settings → General.
- **Habits you count.** A habit can have a number, such as 8 glasses of
  water. Plus counts up, and the habit is done at its number. It has a tick
  box too: ticking it fills the whole count, and unticking empties it, which
  is how a count goes down; there is no minus ("remove this") ("Add a checkbox even for habit with amounts ... if I
  check the box then it checks all the whole amount").
- **Days and times.** A habit can repeat on chosen weekdays only, such as the
  gym on Monday, Wednesday and Friday. On other days it doesn't show and
  doesn't count. A habit can carry a time, "Stretch at 3 PM", and habits
  with times come first, in time order.
- **Only today can be ticked.** There is no going back to yesterday ("remove
  the going back to yesterday to check off habit feature"); the server
  refuses a tick for any other day.
- **Setting them up** is in My settings → Daily card → Routine habits (below).
  A routine holds at most 12 habits. A habit's form has Habit on its own row,
  then Part of the day and At a time, then How many a day and the days beside
  it; no day picked is every day. Every field saves itself, with no Save or
  Cancel: a pick at once, the name and the count when their box is left or
  Enter is pressed, the time when its box is left.
- **Ready-made routines.** With no habits yet, "Start from the samples" adds
  Drink water, Stretch and Plan the day in the morning, Walk, 8 glasses of
  water and Clear the inbox in the afternoon, and Tidy the desk, Read and
  Screens off at night. They're ordinary habits after that.
- **Icons.** Pressing a habit's icon on its row opens the icon picker the
  shell's Settings use, and the pick saves at once: its library, search, and
  any Lucide icon by name through "Add Lucide icon" (Tyler, 31 Oct 2026:
  "reuse the existing icon picker we currently have with its custom icon
  function too", "clicking the icon here should open up the icon picker").
  A habit with none shows a tick. The form has no Icon field of its own.
- **Retire a habit.** It leaves the card. Its ticks are kept and still show
  when looking back. Bring back puts it last in its routine, and its streak
  starts again that day.
- **Bell reminder.** At a time set for each routine, starting at 10 AM, 3 PM
  and 9 PM, if habits in it are still not ticked, the bell says "Your
  morning routine isn't done yet" with what's left. It sends once per
  routine per day. If the server was down at that time, it can still go out
  within the next hour, but never later. No reminder is sent on a day off.
  Each time is changed or switched off in My settings → Notifications, on
  the Morning, Afternoon and Night pills under "Daily routine". That switch turns the whole kind off, and the pills hide while
  it is off (`routine-reminder-times.tsx`). Tyler moved them there from the
  pencil on 6 Nov 2026.
  It runs on the shell's 15-second loop (`sendRoutineReminders`,
  `reminder-jobs.ts`).

### Streaks

- **Finished days.** A day is finished when every habit set for that day is
  ticked. Tasks don't count. A day with no habits set doesn't count either
  way. The count feeds the milestones but is not written on the card (Tyler,
  31 Oct 2026: "remove this text").
- **Each habit's streak** counts only the days it is set for. It is an orange
  chip at the end of the habit's row, "2 days streak" (Tyler, 30 Oct 2026:
  "put the streak here and make it chip styling and call it like "2 days
  streak""). Nothing shows while the streak is at nothing; the best streak is
  kept but no longer shown on the card.
- **Grace.** One missed day per Monday-to-Sunday week keeps a streak going and
  adds nothing to it. A second miss in the same week breaks it.
- **Days off pause streaks.** A day off is skipped, never counted as a miss.
- **Today never breaks a streak.** It only adds once it is done.
- **Milestones.** At 7, 30 and 100 days in a row, a short burst of confetti
  over the card, shown once per streak and milestone. A device that asks for
  less motion gets the toast without the confetti.
- **No week of dots.** A habit on the card shows its tick and its streak
  chip; the row of seven dots under it was taken off (Tyler, 30
  Oct 2026: "remove this").

### The journal

- **Start day.** Until the site admin presses it, the greeting is followed
  only by a "Start day" button with a moving rainbow edge
  ("There should be a "Start day" button like a rate my day button"). Once
  pressed, the next meeting, the routine and, at night,
  tomorrow show for the rest of the card day, morning, afternoon and
  night, and the next card day starts hidden again. It records the time in
  `up_at` and says nothing about sleep: there is no "You slept" ("Remove the
  slept feature"). An employee's card has no Start day.
- **Night:** tomorrow at a glance sits on the card. It lists every team's meetings ("Meeting: 3:00 PM Sprint retro ·
  Sample team"), tasks due across the teams and the site admin's own list
  ("Due: Thank-you notes · Spring launch"), who is off, and holidays.
- **Rate your day** is a button with a moving rainbow edge at the foot of
  the card, at night only ("all these should be in a dropdown in a button").
  It opens the rest of the evening: Rate your day from 1 to 10 ("rating should be out of 10, not 5") with a note,
  the win of the day, and Rate day at the
  foot, with a star, where Going to bed was ("rename this button to "Rate
  day" and change the icon"). Rate day needs a rating first ("Pick how your
  day went, from 1 to 10, first."). Then it closes the window, sets off the
  confetti, says "Day rated. Good night.", and the card's button turns plain
  and reads "Day rated 8 of 10", still opening the window to change it
  ("Clicking on rate my date also should have some action, it just does
  nothing but save it"). There is no chart of the last 30 days' ratings in
  the window (Tyler, 30 Oct 2026: "remove"). The time it was pressed is kept in `bed_at`, the
  column Going to bed used, and isn't shown anywhere. A box still being
  typed in when the window closes is saved too.
- **Only today can be written.** A box saves itself when left, with the
  usual Saving…, Saved or Not saved.
- **Sunday** shows the week's ratings and wins above the usual card, all day.
- **The first of the month** shows last month's best habit (done most often
  for the days it was set), the typical rating and the top wins.
- **Look back** is the graph in the panel's header, before the inbox ("Add
  another icon here with the graph icon"); the card has no Look back button
  ("remove the look back button"). It swaps the panel's cards for Look back,
  and pressing it again, or the inbox, swaps them back, the way the inbox
  does; it is never a window ("Dont put the look back into modal but instead
  put it inline in the left panel like inbox", `daily-look-back.tsx`). While
  it is open the graph bends into a cross, and back again when it shuts, the
  way the inbox's tray does ("clicking on the graph icon shoulkd morhp like
  the inbox icon", `inbox-morph-icon.tsx`). It
  has three tabs, Month, Year and Search, underlined in a header of their own
  under the panel's, like List and Board over My tasks ("put tabs here using
  underline styling"), on the right in a row lower than a panel header ("tabs
  align right and reduce tab height"); there is no "Look back" title. Month is one calendar, Monday first, each day shaded by how
  many of its habits were done ("If there is 10 habits, its too long"). Under
  it is a folded card for each day of the month so far, newest first, with
  the day on the left and its rating on the right ("replace it with
  collapsible card for each day of the month. Day on the left and rating on
  the right, uncollapse it to show all the checked habits and notes for that
  day"). Opened, a day shows the habits done that day, the
  win and the note. This is where the
  journal's past days are read ("we need a place to show the journal days
  history too"). Year is twelve small month calendars, each day's square
  stronger for a better rating and showing its number ("place the rating
  here"), with a 1 to 10 key above them ("fix the year tab"). Both fill the panel's width ("it has to be responsive to the size of
  the panel"): the month calendar and its row of arrows the full width ("this
  should be full width"), the year two
  months across in a narrow panel and more as it widens.
  Search finds a word in wins and notes.

### On their page, as blocks

On the site admin's My dashboard the card is a "/" block on their own page,
the **Daily card** block, in the block card every block has, the greeting
as its heading after a sunrise icon (Tyler, 6 Nov 2026: "make it the same as the
habits and greeting card in the footer (and remove the footer card)"). One
per page. Pressing the greeting folds it to the heading alone, as every
block folds (Tyler, 9 Nov 2026: "this should have the same heading as any
block and the header needs to be collapsible too"). Until they place it, their dashboard shows no Daily card. Two more
blocks show parts of it there (task "My dashboard/left-panel-blocks"; see
[My dashboard](my-dashboard.md#their-pages-blocks)):

- **Rating calendar:** one month of day ratings, laid out as Look back's
  Month tab and shaded as its Year tab. It only shows them.
- **Rating trend:** the last 30 days' ratings as a line.

### In My settings, for the site admin

The Daily card tab holds Card layout, then Routine habits, drawn from Tyler's
picture of the tab (6 Nov 2026). Sky is in General, beside City for the
weather. The reminder times are in Notifications. It all lived behind a pencil
in a window until that day (`daily-settings.tsx`).

- **Card layout**, a grey heading as every list in these menus has, lists Next meeting (Work days), Routine (All day) and Tomorrow, at night
  (Night only) in one bordered list. Dragging a row by its handle sets the
  order the card shows them in, saved in the site admin's account so every
  computer and phone shows the same order ("whats the point of dragging the
  cards in the modal if its not reflected in the panel?"). The Sunday and
  monthly look-backs stay on top, and Start day and Rate your day at the
  foot. An employee's card keeps the card's own order. The switch at the end
  of a row hides that section from the card; it was an eye until 6 Nov 2026.
  The choice is kept in the account too.
- **The habits**, with no title or line of their own (Tyler, 6 Nov 2026:
  "remove this"): Morning, Afternoon and Night as grey headings, each with
  its starting hour right beside it after a clock ("Move the time beside the
  label"), then its habits in one bordered list.
  - Each habit is a handle, its icon on a grey tile (pressing it opens the
    icon picker), its name with how many a day ("4× a day") and its time, and
    a ⋯ with Change (opens its form under it) and "Retire, keeping its ticks".
    Its days are not on the line ("Remove these dates").
  - Dragging a habit into another part's list moves it to that part of the
    day, at the place it was dropped. A part already holding 12 refuses it.
  - The list's last line is "Add habit" ("Add afternoon habit" while the part
    has none), which turns into a name box with Add. Escape puts the line back.
  - With no habits at all, "Start from the samples" sits above the parts.
  - **Retired habits 1** folds at the foot, closed until opened, with Bring
    back on each.
- **Everything saves itself**, habits included; only a new habit's name has
  an Add button. An employee's hours are in My settings → General.

- **Sky** picks the drawn sky or one of four scenes along the bottom of it:
  beach, city, mountains or forest. The scenes are drawn too. "My own photos"
  takes a photo for each part of the day through the shell's image upload.

## Where it is kept

`drizzle/0137_project_daily_card.sql`:

- `project_daily_cards`: each person's hours, city, sky and photos, reminder times, the milestones already celebrated, and the
  site admin's section order (`section_order`, from
  `drizzle/0138_project_daily_sections.sql`) and hidden sections
  (`hidden_sections`, from `drizzle/0140_project_daily_hidden_sections.sql`).
  A habit's `icon` is a shell icon name up to 64 characters since
  `drizzle/0141_project_habit_any_icon.sql`, which turned the old 24 names
  into Lucide's (cup to cup-soda, book to book-open and so on).
- `project_habits` and `project_habit_days`: the site admin's habits and one
  row per habit per day ticked or counted.
- `project_journal_days`: one row per card day. The rating is 1 to 10 since
  `drizzle/0139_project_day_rating_ten.sql`, which doubled the 1 to 5 ratings
  already given. It also holds the note, the win and the Start day and Rate
  day times.
- `project_routine_reminders`: one row per routine reminder sent, written
  with the bell notice so it is sent once.
