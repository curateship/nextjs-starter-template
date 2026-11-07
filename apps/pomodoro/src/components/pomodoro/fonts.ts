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
export function loadPomodoroFonts(target?: Document) {
  if (typeof document === "undefined") return
  const doc = target ?? document
  if (!("fonts" in doc)) return
  if (doc.fonts.check('16px "Bricolage Grotesque"')) return
  // A second window (the floating timer) builds its faces with its own
  // FontFace, and its blank page has no address to resolve "/fonts" against.
  const Face = doc.defaultView?.FontFace ?? FontFace
  const fontUrl = (path: string) =>
    `url("${new URL(path, window.location.origin).href}") format("woff2")`

  const faces = [
    new Face(
      "Bricolage Grotesque",
      fontUrl("/fonts/bricolage-grotesque-latin.woff2"),
      { weight: "400 800", style: "normal", display: "swap" }
    ),
    new Face(
      "JetBrains Mono",
      fontUrl("/fonts/jetbrains-mono-latin.woff2"),
      { weight: "400 700", style: "normal", display: "swap" }
    ),
  ]
  for (const face of faces) {
    doc.fonts.add(face)
    // Fetch now rather than on first use, so text swaps once at most.
    void face.load().catch(() => {})
  }
}

loadPomodoroFonts()
