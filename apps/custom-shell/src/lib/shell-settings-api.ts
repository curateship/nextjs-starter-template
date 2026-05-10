import type { ShellConfig } from "@/lib/custom-shell"

const shellSettingsApiUrl = `${
  import.meta.env.VITE_CUSTOM_SHELL_API_URL ?? ""
}`.replace(/\/$/, "")

type ShellSettingsResponse = {
  settings: ShellConfig | null
}

export function getShellSettingsErrorMessage(error: unknown) {
  if (error instanceof TypeError && error.message === "Failed to fetch") {
    const apiTarget = shellSettingsApiUrl || "the same-origin custom-shell API"
    return `Could not reach ${apiTarget}. Run npm run dev:custom-shell.`
  }

  return error instanceof Error ? error.message : "Shell settings request failed."
}

async function readShellSettingsResponse(response: Response) {
  if (!response.ok) {
    throw new Error(`Shell settings request failed (${response.status}).`)
  }

  const data = (await response.json()) as Partial<ShellSettingsResponse>
  return { settings: data.settings ?? null }
}

export async function loadShellSettings() {
  const response = await fetch(`${shellSettingsApiUrl}/api/v1/shell-settings`, {
    credentials: "include",
  })
  return readShellSettingsResponse(response)
}

export async function saveShellSettings(settings: ShellConfig) {
  const response = await fetch(`${shellSettingsApiUrl}/api/v1/shell-settings`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(settings),
  })

  return readShellSettingsResponse(response)
}
