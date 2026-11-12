# Outside services

Travel asks outside services for help. Google Maps finds places and travel
times and draws the maps. Unsplash finds free photos. Open-Meteo gives the
weather, what far-off days are usually like, and finds where a destination
is, free and with no key. Nager.Date gives public holidays, free and with no
key. All are optional. With no key, Travel still works and the parts that need the service
fall back or hide.

The server makes every call except drawing a map, and its keys never reach the
browser. A map is drawn in the browser, so it uses a second Google key made for
that, which the page can see.

## The keys

- `GOOGLE_MAPS_API_KEY` is a Google Cloud key. Google charges for it. In Google
  Cloud, switch on two APIs for the key: Places API (New) and Routes API.
- `GOOGLE_MAPS_BROWSER_KEY` draws the maps: the trip's Map tab, the Trips
  dashboard's Map widget, and the small map of a place picked in Places. The
  browser sees it, so in Google
  Cloud limit it to the Maps JavaScript API and to the site's own address.
  Without it, each map says the key is missing.
- `UNSPLASH_ACCESS_KEY` is the Access Key of a free Unsplash app.

Both go in `.env` locally and in the app's settings on the server. The server
reads them on every call, so a new key works without a restart.

## Google Maps

- **Place suggestions.** Typing in an activity's place field shows matching
  places under it. Picking one fills in the name, address, map position,
  opening hours, website and phone, Google's rating, number of reviews and
  price, and its kinds of place. A card with no picture then gets the
  place's first Google photo (see [Activities](activities.md)).
- **What a lookup costs.** Google bills a place's details at the dearest
  tier of the fields asked for. Opening hours, website and phone already put
  every lookup in Place Details Enterprise, and the rating, reviews and price
  added on 4 Nov 2026 are in that same tier, so they add nothing per lookup.
  The kinds of place and the photo's name are in a cheaper tier. Downloading
  the photo itself is a separate Place Photos charge, once per card that gets
  a picture. Google's price list was checked on 4 Nov 2026; it can change.
- **One bill per search.** Google charges the typing and the pick as one
  session. The browser makes a new session for each place picked.
- **Opening hours.** Google's weekly hours are saved as seven days, Sunday
  first. A place open past midnight keeps those hours on the day it opens, so
  a bar open Friday 10 PM to 2 AM is saved on Friday. A place open around the
  clock is saved as 00:00 to 23:59 every day.
- **Travel times.** Between two stops that both have a map position, Google
  gives the time to walk, take transit or drive, in whole minutes.

With no Google key, the place field is a plain text box. The typed words become
the place's name and address, with no map position, hours, website or phone.
No travel times show.

## How travel times are saved

Each travel time is saved in the `travel_route_times` table under both map
positions and the travel mode. A position is rounded to 5 decimal places, which
is about a metre, so the same place always finds its saved time.

- The same two places and mode are asked of Google once, ever.
- Changing an address moves its map position, which is a new pair. Google is
  asked again for that pair.
- When Google finds no route, which happens most with transit, nothing is
  saved. Travel asks again next time.
- Best order on a day's menu asks for every pair of its places at once, four
  at a time, through the same saved times (see
  [The day board](the-day-board.md)).

## 100 Google lookups a day

Tyler, 6 Nov 2026: "100 a day", then "Travel's App settings tab" for the
count. Google bills every lookup and anyone can sign up, so each person gets
100 a day, counted from midnight UTC.

- **What counts as one:** picking a place from the search (Google bills the
  typing and the pick as one), filling a card from a Maps link (its search,
  details and photo together), each place a drafted plan, Fill this day, Fill
  every gap or Suggest Ideas looks up, a place's Google photo, and each travel
  time Google is asked for.
- **What doesn't count:** the typing itself, travel times already saved, and
  everything on a server with no `GOOGLE_MAPS_API_KEY`.
- **At the limit** the person sees "You've used today's 100 Google lookups.
  Try again tomorrow." A paste of Maps links stops there. Places in a drafted
  plan past the limit are made with their name alone, like a place Google
  can't find, and a place's photo is left off.
- **The count and the check are one statement**, so two lookups at once can't
  both take the hundredth. One row per person per day is kept in
  `travel_google_lookups` (`drizzle/0106_travel_google_lookups.sql`).
- **Settings → App settings → Google use** (admins only) shows the lookups
  today, this month, and the five people who used the most this month. On a
  server with no key it says nothing is looked up yet.
- The code is `spendGoogleLookup` and `loadGoogleUse` in
  `src/server/travel/google-usage.ts`; the tab is
  `src/components/travel/google-use-settings.tsx`.

## Unsplash

An "Unsplash" button sits next to Upload for a trip's cover and an activity's
picture. It opens a search that starts from the activity's title or the trip's
destination, with 20 photos a page and a Load more button.

A new trip with a destination also gets the top photo for it as its cover,
with no button pressed (see
[Trips and the trip page](trips-and-the-trip-page.md)). That is one search and
one ping per trip made.

Unsplash's rules ask for two things, and Travel does both.

- **Credit under every photo.** The line reads "Photo by Name on Unsplash".
  The name links to the photographer's Unsplash page, and "Unsplash" links to
  the photo's page. Every link carries `utm_source=travel&utm_medium=referral`.
  The `travel` part should match the app name registered with the Unsplash key.
  If the registered name is different, change `UNSPLASH_APP_NAME` in
  `src/server/travel/unsplash.ts`.
- **A ping when a photo is picked.** Picking a photo tells Unsplash it was
  used, before the photo is set. If the ping fails, the photo isn't set and an
  error shows, so a photo is never used without Unsplash counting it.

The server only sends that ping to an `https://api.unsplash.com/` address. Any
other address is refused, so nobody can use the ping to make the server call
somewhere else.

With no Unsplash key, the Unsplash button doesn't show and Upload still works.

## Open-Meteo

- **Weather on each day.** A day of the trip in the next 14 days has its
  forecast in the Weather row of each of its cards' ⋮ menu (Tyler, 4 Nov
  2026, moved off the day's heading): an icon and the high and low in
  Celsius, at the trip's destination. A trip with no destination shows none. Further out, or on a trip with no dates, nothing shows.
- **Chance of rain.** When Open-Meteo gives the day a chance of rain of 30
  out of 100 or more, the line ends with it: "18° / 11° · 70% rain". Below 30,
  or with no chance given, the line is as before (Tyler, 3 Nov 2026: "70%
  rain", picked to show only at 30% or more). The chance is Open-Meteo's
  `precipitation_probability_max`, the highest chance in any hour of the day.
- **Rain at a card's hour** (Travel features 4, part 3). The same forecast
  request also asks for `precipitation_probability` for every hour, in the
  destination's own time, so an outdoor card with a start time can read
  "40% rain at 2:30 PM" (see [The day board](the-day-board.md)). It adds no
  request of its own.
- **What far-off days are usually like** (Tyler, 4 Nov 2026: "Usual high,
  low, rain"). A day past the 14-day forecast shows "Usually 24° / 15° · rain
  on 8 of 30 days" in the same Weather row, from Open-Meteo's historical archive
  (`archive-api.open-meteo.com`) at the destination. One request covers every
  such day of the trip: the same dates in each of the last 10 years whose
  dates, and the 15 days either side, are a week or more in the past. The high
  and low average the 15 days around each date across those years; the rain
  counts the days of 1mm or more in the 31 days around it, scaled to 30. A
  date with under half its history shows nothing.
- **Where a destination is.** The Trips dashboard's Map widget finds each trip's
  destination with Open-Meteo's place search. The same search gives the
  destination's country, for its holidays, and its time zone, which New trip
  and a change of destination use (see
  [Trips and the trip page](trips-and-the-trip-page.md)).
- **Kept answers.** A place is remembered for a day, a forecast for an hour
  and an archive answer for a day, in the server's memory. A failed answer
  shows nothing rather than an error, because weather is an extra.
- The code is `src/server/travel/weather.ts`, and `trip-outlook.ts` for what
  days are usually like.

## Nager.Date

- **Public holidays** (Tyler, 4 Nov 2026: "Heading + card warning"). For a
  dated trip, `date.nager.at/api/v3/PublicHolidays/{year}/{country}` gives
  the holidays of each year the trip covers, in the destination's country.
  Only those the whole country keeps (`global`) count, so a regional one
  never warns where nothing is shut. Two on one day are joined with "and".
- **Where they show:** the Weather row of the day's cards' ⋮ menu names it,
  and its Sight and Food cards read "Holiday, may be shut" (see
  [The day board](the-day-board.md)).
- **Gaps:** Nager.Date covers about 100 countries. Anywhere else, or a
  destination Open-Meteo gives no country for, shows no holidays.
- **Kept answers:** each country and year for a day. A failed answer shows
  nothing. The code is `src/server/travel/trip-outlook.ts`.

## When a service fails

Each call waits at most 10 seconds. A slow or failed answer shows "Google Maps
didn't answer" or "Unsplash didn't answer", with a note to try again in a
minute.

## Where the code is

- `src/server/travel/google.ts` and `src/server/travel/unsplash.ts` make the
  calls.
- `src/lib/api/travel/services.ts` holds the endpoints the screens use. Every
  one needs a signed-in person.
- `src/components/travel/place-search-field.tsx` is the place field.
- `src/components/travel/unsplash-picker.tsx` is the Unsplash button and
  window, and the credit line.
- `src/components/travel/use-travel-services.ts` asks the server once per page
  which services have keys.
