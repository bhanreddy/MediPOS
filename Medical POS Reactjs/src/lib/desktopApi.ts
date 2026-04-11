import { invoke } from '@tauri-apps/api/core'

type AppInfo = {
  name: string
  version: string
  offlineFirst: boolean
}

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

export async function getDesktopAppInfo(): Promise<AppInfo | null> {
  if (!isTauriRuntime()) {
    return null
  }

  return invoke<AppInfo>('get_app_info')
}

export async function desktopHealthCheck(): Promise<string | null> {
  if (!isTauriRuntime()) {
    return null
  }

  return invoke<string>('health_check')
}
