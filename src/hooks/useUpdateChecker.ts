import { useState, useEffect, useCallback } from 'react'
import { check } from '@tauri-apps/plugin-updater'

const DISMISSED_VERSION_KEY = 'dismissed_update_version'

// 检测是否为 Tauri 桌面环境
const isTauri = typeof window !== 'undefined' && window.__TAURI_INTERNALS__ !== undefined

interface UpdateInfo {
  version: string
  notes?: string
  pub_date?: string
}

export function useUpdateChecker() {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const checkForUpdates = useCallback(async () => {
    // 仅在 Tauri 桌面环境检查更新
    if (!isTauri) return

    try {
      setError(null)
      const update = await check()

      if (!update) {
        return
      }

      // 检查是否被用户跳过
      const dismissedVersion = localStorage.getItem(DISMISSED_VERSION_KEY)
      if (dismissedVersion === update.version) {
        return
      }

      setUpdateInfo({
        version: update.version,
        notes: update.body || undefined,
        pub_date: update.date || undefined,
      })
    } catch (err) {
      console.error('检查更新失败:', err)
      // 静默失败，不影响用户使用
    }
  }, [])

  const startUpdate = useCallback(async () => {
    if (!updateInfo) return
    // 仅在 Tauri 桌面环境支持更新
    if (!isTauri) return

    try {
      setDownloading(true)
      setDownloadProgress(0)

      const update = await check()
      if (!update) {
        setError('未找到可用更新')
        setDownloading(false)
        return
      }

      let totalBytes = 0
      let downloadedBytes = 0

      await update.downloadAndInstall((event) => {
        if (event.event === 'Started') {
          totalBytes = event.data.contentLength || 0
        } else if (event.event === 'Progress') {
          downloadedBytes += event.data.chunkLength
          if (totalBytes > 0) {
            setDownloadProgress((downloadedBytes / totalBytes) * 100)
          }
        }
      })

      setDownloading(false)
    } catch (err) {
      console.error('更新失败:', err)
      setError(err instanceof Error ? err.message : '更新失败')
      setDownloading(false)
    }
  }, [updateInfo])

  const dismissUpdate = useCallback(() => {
    if (updateInfo) {
      // 存储被跳过的版本号
      localStorage.setItem(DISMISSED_VERSION_KEY, updateInfo.version)
    }
    setUpdateInfo(null)
  }, [updateInfo])

  // 清除已忽略的版本记录（用于重新提示更新）
  const clearDismissedVersion = useCallback(() => {
    localStorage.removeItem(DISMISSED_VERSION_KEY)
  }, [])

  // 应用启动时自动检查更新（只执行一次）- 仅在 Tauri 环境
  useEffect(() => {
    if (isTauri) {
      checkForUpdates()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return {
    updateInfo,
    downloading,
    downloadProgress,
    error,
    checkForUpdates,
    startUpdate,
    dismissUpdate,
    clearDismissedVersion,
  }
}
