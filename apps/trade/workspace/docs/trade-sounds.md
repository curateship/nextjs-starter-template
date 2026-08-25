# Sounds for fills, stops and targets

Settings has one Trade Sounds switch. The switch belongs to the account, starts
off, and controls both sounds. System volume controls how loud they are.
The app reads the switch once after sign-in and remembers it while the app stays
open. Returning to Sounds shows the known switch immediately instead of loading
the same setting again.

Turning the switch on plays the fill sound during that click. The preview makes
the setting testable without placing an order and gives the browser a direct
request to allow audio. If playback is refused, Settings says that the sound did
not play and points to the site's sound permission. The setting still stays on.
The fill preview is audible. The same click starts the stop player silently and
resets it, because Safari grants sound permission to each audio player rather
than to the page as a whole.

A fill uses the short high sound in `public/sounds/trade-fill.wav`. A stop or
target uses the lower warning sound in `public/sounds/trade-stop.wav`. The
notice remains the record. Its Trade metadata says which sound an open Trade
screen may play, so one notice can never turn into two sounds after a reload.
The preview and later notices reuse the same two retained audio players in that
tab. Creating a new player only after money moved left some browsers free to
refuse the call even after the page had been used.

## Bursts stay short

Repeats of the same sound within two seconds collapse into one. Twenty ladder
rungs can still write twenty bell notices, but they make one fill sound. Fill
and stop sounds have separate clocks, so a stop notice can still sound after
the fill that closed the position.

## When the browser stays silent

Nothing plays while the switch is off, while signed out, or before the browser
tab has been used. A browser may refuse audio for its own autoplay rules. The
refusal is ignored and the bell notice still lands.

Each open browser tab follows its own audio permission and its own two-second
collapse. Tabs do not coordinate sounds with each other. The app has to be open
on a Trade screen. Sounds do not turn the browser into a push-notification
service after the app closes.
