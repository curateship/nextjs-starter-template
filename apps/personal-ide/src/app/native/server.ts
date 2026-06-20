import { invoke } from "@tauri-apps/api/core"

export function openServerUrl(port: number) {
  return invoke("open_server_url", { port })
}
