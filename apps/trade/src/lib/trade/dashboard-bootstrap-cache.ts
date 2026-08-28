let version = 0

/**
 * Make the next dashboard navigation miss its one-minute route cache.
 *
 * The dashboard currently on screen keeps its local optimistic state. The
 * next visit gets a fresh opening answer instead of replaying data from before
 * a drawing, wallet or setting save.
 */
export function invalidateDashboardBootstrap() {
  version += 1
}

export function dashboardBootstrapVersion() {
  return version
}
