# The Daily card

The Daily card sits at the top of My dashboard's left panel, above every other
card, for everyone. It works like a personal assistant. It greets the person,
draws a sky for the time of day, and shows what to work on and what's next.
The site admin's card also holds their habits, streaks and a short journal,
and nobody else ever sees those. Tyler asked for it on 29 Oct 2026. His
answers are in [What this app is](what-this-app-is.md) under "Choices for the
Daily card", and that file wins wherever the two disagree.

## One card, the same for everyone

- **Where it is.** It is the first card on the left of My dashboard: an
  employee's in `my-dashboard.tsx`, the site admin's in `admin-dashboard.tsx`.
  Both draw the same `daily-card.tsx`. It loads with the page
  (`loadDailyCard`, `src/server/project/daily-card.ts`).
- **The parts of the day follow each person's own hours.** Morning starts at
  5 AM, afternoon at 12 PM and night at 6 PM until the person changes them
  behind the card's pencil. Night runs past midnight until morning starts,
  in the person's own zone. Morning has to start before afternoon, and
  afternoon before night.
- **The card's day.** Before morning starts it is still last night on the
  card. A night habit ticked at 1 AM counts for the evening before, and
  Going to bed at 12:30 AM lands on that evening too. Tasks and meetings
  still use the calendar day.
- **The greeting.** "Good morning Tyler, it's Thursday", then "Good afternoon
  Tyler", then "Good evening Tyler, time to wind down". After midnight it
  reads "Still up Tyler? Time to rest". It uses the first name only, and
  leaves the name out when there is none.
- **The sky.** It is a drawing: a sunrise for the first hour of the morning,
  blue sky, gold for the last 90 minutes of the afternoon, a sunset for the
  first hour of the night, then stars. A dark fade along the bottom keeps
  the words readable over any sky (`daily-sky.tsx`).
- **The weather.** A City field in My settings, behind the cog beside the
  name. The card's sky then shows that city's weather, such as clouds, rain,
  snow or fog, and "12°, rain in Toronto" under the greeting. The browser
  never asks where the person is. The weather comes from Open-Meteo, which
  is free and needs no key. Each place's weather is kept for 30 minutes. If
  the service doesn't answer, the sky follows the clock alone and nothing
  shows an error. A city it can't find is refused with "We couldn't find
  that city".
- **Deep work.** An employee's are the tasks they picked at today's check-in
  that aren't Done. The site admin has no check-in, so theirs are their three
  most urgent open tasks: overdue first, then the soonest due date, then High
  priority. Tasks waiting to be accepted are left out. Each has Start, which
  starts the task clock exactly as the task panel's Start does. Pressing the
  title opens the task on the right. Deep work follows no filter on My tasks.
- **The next meeting.** "Standup in 25 minutes", then "Standup now" while it
  runs, or "Standup at 3:00 PM" when it is more than an hour off. An
  employee sees the meetings they're invited to. The site admin sees every
  team's. A meeting someone said Not going to is left out.
- **Check-in nudge.** Before an employee has checked in today, morning and
  afternoon, the card says "Check in to plan your day", which opens the
  check-in window.
- **Afternoon progress.** "2 of 3 done, 3h 10m clocked today". The first half
  counts today's picks finished today. The site admin's reads "2 done
  today". Clocked time is every stretch of the task clock since midnight,
  plus fixes made today. Nothing shows while there's nothing to count.
- **Wind-down at night.** What the person finished today, a line saying a
  task's clock is still running with Pause, and for an employee who checked
  in, "Check out and plan tomorrow".
- **Day off.** On the person's own time off, the card reads "Enjoy your day
  off". On a team holiday it reads "Enjoy Christmas Day". It shows no deep
  work and no check-in nudge that day. The site admin is on no team, so
  their day off is their own time off, or a holiday every team has that day.
- **Fold it.** The arrow on the sky folds the card down to the greeting line.
  This browser remembers it, like the other cards.
- **On a phone** the site admin's My dashboard opens on the Me tab, where the
  Daily card is first. An employee's still opens on My tasks.

## The site admin's own parts

Only the site admin has these ("The habits is admin only"). Every function
that reads or writes them refuses anyone else, and none of it is ever shown on
a team screen or sent to anyone.

### Routines

- **Three lists of habits: morning, afternoon and night.** The card shows the
  list for the current part of the day, with a tick for each habit. Ticks
  start again each card day.
- **Habits you count.** A habit can have a number, such as 8 glasses of
  water. Plus and minus change the count, and the habit is done at its
  number.
- **Days and times.** A habit can repeat on chosen weekdays only, such as the
  gym on Monday, Wednesday and Friday. On other days it doesn't show and
  doesn't count. A habit can carry a time, "Stretch at 3 PM", and habits
  with times come first, in time order.
- **Tick yesterday.** "Tick yesterday" switches the list to yesterday's, and
  no earlier day can be changed. A tick for yesterday counts as if it had
  been made on time.
- **Setting them up** is behind the pencil on the sky. Each routine has "Add a
  habit", and each habit has a cog to change it, a handle to drag it into
  order, and Retire. A routine holds at most 12 habits.
- **Ready-made routines.** With no habits yet, "Start from the samples" adds
  Drink water, Stretch and Plan the day in the morning, Walk, 8 glasses of
  water and Clear the inbox in the afternoon, and Tidy the desk, Read and
  Screens off at night. They're ordinary habits after that.
- **Icons.** Each habit can carry one of 24 small icons, such as a cup.
- **Retire a habit.** It leaves the card. Its ticks are kept and still show
  when looking back. Bring back puts it last in its routine, and its streak
  starts again that day.
- **Bell reminder.** At a time set for each routine, starting at 10 AM, 3 PM
  and 9 PM, if habits in it are still not ticked, the bell says "Your
  morning routine isn't done yet" with what's left. It sends once per
  routine per day. If the server was down at that time, it can still go out
  within the next hour, but never later. No reminder is sent on a day off.
  Each time can be changed or switched off behind the pencil. The site
  admin can also switch the whole kind off in My settings → Bell notices.
  It runs on the shell's 15-second loop (`sendRoutineReminders`,
  `reminder-jobs.ts`).

### Streaks

- **Finished days.** A day is finished when every habit set for that day is
  ticked. Tasks don't count. A day with no habits set doesn't count either
  way.
- **Each habit's streak** counts only the days it is set for, with its best
  beside it ("12 days in a row, best 31"). Nothing shows before a habit's
  first tick.
- **Grace.** One missed day per Monday-to-Sunday week keeps a streak going and
  adds nothing to it. A second miss in the same week breaks it.
- **Days off pause streaks.** A day off is skipped, never counted as a miss.
- **Today never breaks a streak.** It only adds once it is done.
- **Milestones.** At 7, 30 and 100 days in a row, a short burst of confetti
  over the card, shown once per streak and milestone. A device that asks for
  less motion gets the toast without the confetti.
- **A week of dots** after each habit, Monday first: filled for done, a ring
  for missed, a dashed ring for today not done yet, a dash for a day that
  doesn't count, and a small dot for days still to come.

### The journal

- **Morning:** Up, then "You slept 7h 20m" from last night's Going to bed.
  "Today I want to...", and a line for the day. The line comes from 365
  built-in lines, one per day of the year, mixed with the site admin's own
  (`daily-words.ts`, all written for Project).
- **Afternoon:** the morning's intention, read back.
- **Night:** tomorrow at a glance and the morning's intention sit on the card.
  Tomorrow lists every team's meetings ("Meeting: 3:00 PM Sprint retro ·
  Sample team"), tasks due across the teams and the site admin's own list
  ("Due: Thank-you notes · Spring launch"), who is off, and holidays.
- **Rate your day** is a button with a moving rainbow edge, right of Look
  back, at night only ("all these should be in a dropdown in a button").
  It opens the rest of the evening: Rate your day from 1 to 5 with a note,
  the win of the day, tonight's question with an answer, "Tomorrow I want
  to...", Going to bed, and a small line of the last 30 days' ratings. A box
  still being typed in when the window closes is saved too.
- **Tonight's question** comes from about 60 built in plus the site admin's
  own. A question is saved with its answer, so changing the list never
  changes an old answer.
- **Only today can be written.** The one day ahead is tomorrow's intention,
  written tonight. A box saves itself when left, with the usual Saving…,
  Saved or Not saved.
- **On this day.** "A year ago today you wrote...", with that day's win or
  intention, when there is one.
- **Sunday** shows the week's ratings and wins above the usual card, all day.
- **The first of the month** shows last month's best habit (done most often
  for the days it was set), the typical rating and the top wins.
- **Look back** at the bottom of the card opens a window with three tabs.
  Month shows every habit as a row of ticks for the month. Year shows a
  square for every day, stronger for a better rating, with the number in it.
  Search finds a word in intentions, wins, notes and answers.

### Behind the pencil, for the site admin

Your hours, Habits, Reminders, Sky, Your own lines and Your own night
questions. Everything saves itself, apart from a habit, which has Create
habit and Save changes. An employee's pencil holds Your hours only.

- **Sky** picks the drawn sky or one of four scenes along the bottom of it:
  beach, city, mountains or forest. The scenes are drawn too. "My own photos"
  takes a photo for each part of the day through the shell's image upload.

## Where it is kept

`drizzle/0137_project_daily_card.sql`:

- `project_daily_cards`: each person's hours, city, sky and photos, own lines
  and questions, reminder times, and the milestones already celebrated.
- `project_habits` and `project_habit_days`: the site admin's habits and one
  row per habit per day ticked or counted.
- `project_journal_days`: one row per card day.
- `project_routine_reminders`: one row per routine reminder sent, written
  with the bell notice so it is sent once.
