# Outside services

Travel asks outside services for help. Google Maps finds places and travel
times and draws the maps. Unsplash finds free photos. Open-Meteo gives the
weather and finds where a destination is, free and with no key. All are
optional. With no key, Travel still works and the parts that need the service
fall back or hide.

The server makes every call except drawing a map, and its keys never reach the
browser. A map is drawn in the browser, so it uses a second Google key made for
that, which the page can see.

## The keys

- `GOOGLE_MAPS_API_KEY` is a Google Cloud key. Google charges for it. In Google
  Cloud, switch on two APIs for the key: Places API (New) and Routes API.
- `GOOGLE_MAPS_BROWSER_KEY` draws the maps: the trip's Map tab and the map of
  places visited above the Trips table. The browser sees it, so in Google
  Cloud limit it to the Maps JavaScript API and to the site's own address.
  Without it, each map says the key is missing.
- `UNSPLASH_ACCESS_KEY` is the Access Key of a free Unsplash app.

Both go in `.env` locally and in the app's settings on the server. The server
reads them on every call, so a new key works without a restart.

## Google Maps

- **Place suggestions.** Typing in an activity's place field shows matching
  places under it. Picking one fills in the name, address, map position,
  opening hours, website and phone.
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

## Unsplash

An "Unsplash" button sits next to Upload for a trip's cover and an activity's
picture. It opens a search that starts from the activity's title or the trip's
destination, with 20 photos a page and a Load more button.

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

- **Weather on each day.** A day of the trip in the next 14 days shows its
  forecast under its heading: an icon and the high and low in Celsius, at the
  trip's destination. A trip with no destination shows none. Further out, or on a trip with no dates, nothing shows.
- **Where a destination is.** The map of places visited finds each trip's
  destination with Open-Meteo's place search.
- **Kept answers.** A place is remembered for a day and a forecast for an
  hour, in the server's memory. A failed answer shows nothing rather than an
  error, because weather is an extra.
- The code is `src/server/travel/weather.ts`.

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
