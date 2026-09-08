# Directory distance control

The directory's Within picker needs a location to measure from. Before a place
is active, the picker is disabled. Hovering over the disabled control or reaching
its wrapper with Tab shows "Pick a location first."

A successful place search or browser location request enables Within as soon as
the location reaches the page state. Typing a place without searching does not
enable the picker. A pending or failed request leaves it disabled unless a
previous location is still active.

Clearing the location or clearing all search filters disables Within again.
Opening a saved address with a location enables the picker immediately. The
choices remain 5, 10, 25 and 50 km, with 10 km as the default. The disabled picker
cannot open its options or call the radius-change handler.

## Test road map

1. Open `/directory` without search parameters. Within should show 10 km and
   appear disabled. Hover over the control or Tab to its wrapper to read the
   explanation. Clicking should leave the address unchanged.
2. Enter a town or postcode and select Search place. If place search is enabled
   for the site, Within should become usable once the search succeeds.
3. Clear location. Select Use my location and allow access. Within should become
   usable immediately after the location arrives. Choose 50 km and check that
   the address contains `radius=50`.
4. Clear location again, then try a failed search or deny location access. Within
   should stay disabled. An existing active location should remain usable if a
   later search fails.
5. Open a saved directory address containing a location and radius. Check that
   Within uses that radius and is enabled. Clear search should disable it.
6. Repeat on a 390px screen in dark theme. Check the tooltip, keyboard access,
   dropdown, and absence of horizontal overflow.

The toolbar regression tests render the real Select and DisabledReason
components. They cover the initial explanation, enabled radius selection,
clearing, successful and failed place searches, and pending geolocation followed
by success.
