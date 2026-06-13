import { createServerFn } from "@tanstack/react-start"

import { makeSafeErrorMessage } from "@/lib/api/shared"
import type { PhoneNumberItem, ProviderStatus } from "@/server/provider-settings"

export type { PhoneNumberItem, ProviderStatus }

export const getProviderErrorMessage = makeSafeErrorMessage(
  "Provider request failed.",
  new Set(["Voice provider not configured"])
)

const getProviderStatusFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<ProviderStatus> => {
    const { getProviderStatusForCurrentUser } = await import(
      "@/server/provider-settings"
    )
    return getProviderStatusForCurrentUser()
  }
)

const testProviderConnectionFn = createServerFn({ method: "POST" }).handler(
  async (): Promise<{ ok: true; phone_number_count: number }> => {
    const { testProviderConnectionForCurrentUser } = await import(
      "@/server/provider-settings"
    )
    return testProviderConnectionForCurrentUser()
  }
)

const syncPhoneNumbersFn = createServerFn({ method: "POST" }).handler(
  async (): Promise<PhoneNumberItem[]> => {
    const { syncPhoneNumbersForCurrentUser } = await import(
      "@/server/provider-settings"
    )
    return syncPhoneNumbersForCurrentUser()
  }
)

export function getProviderStatus() {
  return getProviderStatusFn()
}

export function testProviderConnection() {
  return testProviderConnectionFn()
}

export function syncPhoneNumbers() {
  return syncPhoneNumbersFn()
}
