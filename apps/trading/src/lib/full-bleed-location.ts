/** Screens that drop the padded content frame and manage their own layout. */
export function isFullBleedLocation(location: {
  pathname: string
  search: unknown
}): boolean {
  const search = location.search as { run?: string; draft?: unknown }
  return (
    location.pathname === "/trade" ||
    /^\/bots\/.+/.test(location.pathname) ||
    /^\/automations\/.+/.test(location.pathname) ||
    (location.pathname === "/backtest" && Boolean(search.run || search.draft))
  )
}
