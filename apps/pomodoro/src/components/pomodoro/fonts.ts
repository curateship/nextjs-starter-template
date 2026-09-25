/**
 * Loads the two Pomoder fonts, self-hosted in public/fonts.
 *
 * Not @font-face on purpose. The tokens stylesheet next to this file must
 * hold no url(): a bundler that ever pulls it server-side — the worker's
 * esbuild has no .woff2 loader — fails on one. The FontFace API keeps the
 * font files as plain runtime strings no bundler looks at, and the document
 * guard means nothing happens on the server. Imported by PomodoroScreen, so
 * only the member-facing screens fetch the fonts.
 *
 * Both files are variable fonts, so one FontFace covers the weight range.
 */
export function loadPomodoroFonts() {
  if (typeof document === "undefined" || !("fonts" in document)) return
  if (document.fonts.check('16px "Bricolage Grotesque"')) return

  const faces = [
    new FontFace(
      "Bricolage Grotesque",
      'url("/fonts/bricolage-grotesque-latin.woff2") format("woff2")',
      { weight: "400 800", style: "normal", display: "swap" }
    ),
    new FontFace(
      "JetBrains Mono",
      'url("/fonts/jetbrains-mono-latin.woff2") format("woff2")',
      { weight: "400 700", style: "normal", display: "swap" }
    ),
  ]
  for (const face of faces) {
    document.fonts.add(face)
    // Fetch now rather than on first use, so text swaps once at most.
    void face.load().catch(() => {})
  }
}

loadPomodoroFonts()
