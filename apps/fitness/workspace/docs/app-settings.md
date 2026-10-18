# Fitness's settings

Tyler, 18 Oct 2026: "all these settings live in settings page in the app settings reserved for the app." They are four tabs under App settings in the Settings rail, at `/admin/settings/<tab>`. Only the site admin reaches that page, so each setting is one answer for the whole app, not one per person.

## The tabs

- **Units and plates** (`fitness-units`): kilograms or pounds, the smallest jump the plates allow (2.5 kg to start), the empty bar (20 kg) and the plates on hand (25, 20, 15, 10, 5, 2.5 and 1.25 kg). Every weight is stored in kilograms, so switching to pounds changes what every screen shows and nothing that was logged.
- **Workouts** (`fitness-workouts`): whether heavy lifts start with warm-up sets, the weekly goal (3 workouts to start) and sex, which is only used to compare lifts with others of the same size. Not set hides those comparisons.
- **Reminders** (`fitness-reminders`): whether people get a notice on workout days, whether they get a nudge the day after a missed one, the time (07:00 to start, on each person's own clock) and whether it goes to the bell, email or both. See `reminders-and-calendar-feed.md`.
- **Calendar feed** (`fitness-calendar`): the signed-in person's own feed address for Google or Apple Calendar, with Turn on, Reset address, Turn off and Copy. The feed is the one thing here that is the viewer's own, because the address carries their own secret.

## How they save

- Nothing has a Save button. A switch or a pick saves at once; a typed number saves 700ms after the last key, or straight away when the field is left or Enter is pressed. The page header says Saving…, Saved or Not saved.
- A value that breaks its rules (a weekly goal of 40, a plate list with a word in it) is refused with a red message, and what was typed stays on screen. A refused save puts the old value back.
- The settings are read once per page and held, so moving between the four tabs draws at once.

## Where the code is

- The tabs: `src/components/fitness/settings/fitness-settings-tabs.tsx`, listed in `settings.tabs` in `src/app/options.ts`.
- The rules and defaults: `src/lib/fitness/app-settings.ts`. One row per tab in `fitness_app_settings` (`src/server/fitness/app-settings.ts`); a stored row that no longer fits its rules falls back to the default for that tab.
- Screens read them through `preferencesFor` in `src/server/fitness/profile.ts`, which adds the person's own time zone and whether their calendar feed is on.
