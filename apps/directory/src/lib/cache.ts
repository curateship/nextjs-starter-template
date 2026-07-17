// Next.js data-cache shims for the Vite/TanStack port. There is NO cache in
// this app: unstable_cache calls the wrapped function directly and the
// revalidate*/cache* helpers are intentional no-ops kept only so ported
// server actions compile. Calling revalidatePath/revalidateTag does NOT
// refresh anything — after a mutation, screens must update client state (or
// re-fetch / router.refresh()) themselves.
type AsyncFunction<TArgs extends unknown[], TResult> = (...args: TArgs) => Promise<TResult>

export function unstable_cache<TArgs extends unknown[], TResult>(
  fn: AsyncFunction<TArgs, TResult>,
  _keyParts?: string[],
  _options?: { revalidate?: number | false; tags?: string[] }
) {
  return fn
}

export function revalidatePath(_path: string, _type?: "layout" | "page") {}

export function revalidateTag(_tag: string, _profile?: string) {}

export function cacheTag(..._tags: string[]) {}

export function cacheLife(_profile: string | object) {}
