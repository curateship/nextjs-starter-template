import * as React from "react"

import { loadTravelServices } from "@/lib/api/travel/services"

type Services = { google: boolean; unsplash: boolean; mapsKey: string | null }

const OFF: Services = { google: false, unsplash: false, mapsKey: null }

// One question to the server per page load, shared by every field that asks.
let asked: Promise<Services> | null = null
let known: Services | null = null

/**
 * Which outside services have keys on this server. Until the answer comes
 * both are off and `ready` is false. A failed answer counts as both off and
 * is asked again on the next mount.
 */
export function useTravelServices(): Services & { ready: boolean } {
  const [services, setServices] = React.useState<Services | null>(known)

  React.useEffect(() => {
    if (known) return
    let live = true
    asked ??= loadTravelServices().then(
      (answer) => {
        known = answer
        return answer
      },
      () => {
        asked = null
        return OFF
      }
    )
    void asked.then((answer) => {
      if (live) setServices(answer)
    })
    return () => {
      live = false
    }
  }, [])

  return { ...(services ?? OFF), ready: services !== null }
}
