const customShellApiUrl = `${
  import.meta.env.VITE_CUSTOM_SHELL_API_URL ?? ""
}`.replace(/\/$/, "")

export type AuthUser = {
  id: string
  email: string
  name: string
  role: string
}

type AuthMeResponse = {
  user: AuthUser
}

export function getAuthErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Authentication request failed."
}

async function readAuthResponse(response: Response) {
  if (!response.ok) {
    throw new Error(
      response.status === 401
        ? "Invalid email or password."
        : `Authentication request failed (${response.status}).`
    )
  }

  return (await response.json()) as AuthMeResponse
}

export async function loadCurrentUser() {
  const response = await fetch(`${customShellApiUrl}/api/v1/auth/me`, {
    credentials: "include",
  })

  if (response.status === 401) {
    return null
  }

  return (await readAuthResponse(response)).user
}

export async function login(email: string, password: string) {
  const response = await fetch(`${customShellApiUrl}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ email, password }),
  })

  return (await readAuthResponse(response)).user
}

export async function logout() {
  const response = await fetch(`${customShellApiUrl}/api/v1/auth/logout`, {
    method: "POST",
    credentials: "include",
  })

  if (!response.ok) {
    throw new Error(`Logout failed (${response.status}).`)
  }
}
