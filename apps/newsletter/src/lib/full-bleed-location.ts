/** Screens that drop the padded content frame and manage their own layout. */
export function isFullBleedLocation(location: { pathname: string }): boolean {
  // The automation editor is a full-screen workspace: it draws its own panels
  // and pads itself from --shell-gutter, so it skips the padded content frame.
  return /^\/automations\/.+/.test(location.pathname)
}
