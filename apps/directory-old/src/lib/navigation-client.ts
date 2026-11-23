import { useMemo } from "react"
import { useLocation, useRouter as useTanStackRouter } from "@tanstack/react-router"

export function usePathname() {
  return useLocation().pathname
}

export function useSearchParams() {
  const search = useLocation().searchStr
  return useMemo(() => new URLSearchParams(search), [search])
}

export function useRouter() {
  const router = useTanStackRouter()

  return useMemo(
    () => ({
      push: (href: string, _options?: { scroll?: boolean }) =>
        router.navigate({ to: href }),
      replace: (href: string, _options?: { scroll?: boolean }) =>
        router.navigate({ to: href, replace: true }),
      back: () => router.history.back(),
      forward: () => router.history.forward(),
      refresh: () => router.invalidate(),
      prefetch: (href: string) => router.preloadRoute({ to: href }),
    }),
    [router]
  )
}
