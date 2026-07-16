# User interface

The standalone Pomodoro Dashboard is the visual source of truth: near-black surfaces, tomato accent, Bricolage Grotesque headings, JetBrains Mono timer data, compact navigation, ambient hero media, and restrained borders.

The application is route-based instead of prototype state. Desktop uses a fixed rail and dashboard grid; mobile uses an off-canvas rail and stacked content. All controls use native buttons/inputs, visible focus, labels, meaningful empty/error states, and WCAG AA contrast.

Guest mode exposes the timer, temporary tasks, preferences, pricing, and curated previews. Account, room, upload, billing, and generation actions explain their authentication or Pro requirement instead of silently failing.

Ambient sound is one shell-level player shared by the header quick controls, the compact header player, and the Sounds catalog. Selections use one canonical reference (`curated:<key>` for the first-party loops in `public/pomoder/audio-*.mp3`, `media:<uuid>` for ready user audio), persist to browser storage for guests and to `user_preferences` for accounts, and never autoplay after a reload — a visible play control resumes instead. Playback failures surface a dismissible notice; unavailable user media stops and clears itself. Optional completion alerts (chime plus browser notification) are enabled only from the Settings toggle, which is the sole place notification permission is requested. Curated loops are regenerated with `node scripts/generate-curated-sounds.mjs`.
