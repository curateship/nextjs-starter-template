export type TimedPromise<T> = {
  at: number
  answer: Promise<T>
}

/**
 * Keeps one promise in a map and forgets a rejected answer. The identity check
 * prevents an older rejection from deleting a newer request for the same key.
 */
export function rememberPromise<K, V, E extends { answer: Promise<V> }>(
  cache: Map<K, E>,
  key: K,
  entry: E
): Promise<V> {
  cache.set(key, entry)
  void entry.answer.catch(() => {
    if (cache.get(key) === entry) cache.delete(key)
  })
  return entry.answer
}

/** Reads through a timed promise cache using the caller's freshness rule. */
export function loadHeldPromise<K, V>(
  cache: Map<K, TimedPromise<V>>,
  key: K,
  stillStands: (at: number) => boolean,
  load: () => Promise<V>
): Promise<V> {
  const held = cache.get(key)
  if (held && stillStands(held.at)) return held.answer
  return rememberPromise(cache, key, { at: Date.now(), answer: load() })
}
