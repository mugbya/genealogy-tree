import { useState, useEffect, useRef, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Settings,
  Network,
  Crown,
  ChevronRight,
  Save,
  RefreshCw,
  Wifi,
  Shield,
  Zap,
  Download,
  QrCode,
  Check,
  HardDrive,
  Copy,
  Key,
} from 'lucide-react'
import { wechatApi } from '@/api/client'
import { useAuthStore } from '@/stores'
import { useUpdateChecker } from '@/hooks/useUpdateChecker'
import { getVersion } from '@tauri-apps/api/app'
import { invoke } from '@tauri-apps/api/core'
import { licenseApi, LicenseInfo } from '@/api/client'
import { LicenseDialog } from '@/components/LicenseDialog'

// 数据库路径信息
interface DatabasePathInfo {
  path: string
  os_type: string  // macos, linux, windows
}

type TabType = 'general' | '穿透' | 'platinum' | 'update' | 'license'

const tabs = [
  { id: 'general' as TabType, label: '通用设置', icon: Settings },
  // { id: '穿透' as TabType, label: '内网穿透', icon: Network },
  // { id: 'platinum' as TabType, label: '白金版', icon: Crown },
  { id: 'update' as TabType, label: '版本更新', icon: RefreshCw },
  { id: 'license' as TabType, label: '授权管理', icon: Key },
]

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState<TabType>('general')

  return (
    <div className="flex gap-6 h-full">
      {/* 左侧垂直 Tab 导航 */}
      <div className="w-56 shrink-0">
        <Card className="h-full border-0 shadow-sm">
          <CardContent className="p-3">
            <div className="space-y-1">
              {tabs.map((tab) => {
                const Icon = tab.icon
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-all ${
                      activeTab === tab.id
                        ? 'bg-zinc-900 text-white'
                        : 'text-zinc-600 hover:bg-zinc-100'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span className="font-medium">{tab.label}</span>
                    {activeTab === tab.id && (
                      <ChevronRight className="w-4 h-4 ml-auto" />
                    )}
                  </button>
                )
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 右侧内容区 */}
      <div className="flex-1 min-w-0">
        {activeTab === 'general' && <GeneralSettings />}
        {activeTab === '穿透' && <IntranetPenetration />}
        {activeTab === 'platinum' && <PlatinumSettings />}
        {activeTab === 'update' && <UpdateSettings />}
        {activeTab === 'license' && <LicenseSettings />}
      </div>
    </div>
  )
}

function GeneralSettings() {
  const [autoStart, setAutoStart] = useState(false)
  const [httpPort, setHttpPort] = useState('8080')
  const [httpsPort, setHttpsPort] = useState('8443')
  const [isSaving, setIsSaving] = useState(false)
  const [dbPathInfo, setDbPathInfo] = useState<DatabasePathInfo | null>(null)
  const [copied, setCopied] = useState(false)

  // 获取数据库路径
  useEffect(() => {
    const fetchDbPath = async () => {
      try {
        const info = await invoke<DatabasePathInfo>('get_database_path')
        setDbPathInfo(info)
      } catch (err) {
        console.error('获取数据库路径失败:', err)
      }
    }
    fetchDbPath()
  }, [])

  // 复制路径到剪贴板
  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // 获取操作系统显示名称
  const getOsDisplayName = (osType: string) => {
    switch (osType) {
      case 'macos': return 'macOS'
      case 'linux': return 'Linux'
      case 'windows': return 'Windows'
      default: return osType
    }
  }

  const handleSave = async () => {
    setIsSaving(true)
    // TODO: 调用后端 API 保存设置
    try {
      // await configApi.setBatch([...])
      console.log('保存设置:', { autoStart, httpPort, httpsPort })
    } catch (err) {
      console.error('保存失败:', err)
    }
    setIsSaving(false)
  }

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <Settings className="w-5 h-5" />
          通用设置
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-8 max-w-4xl">
        {/* 开机启动 */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-zinc-700">系统设置</h3>
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${autoStart ? 'bg-green-100' : 'bg-zinc-100'}`}>
                <Zap className={`w-5 h-5 ${autoStart ? 'text-green-600' : 'text-zinc-400'}`} />
              </div>
              <div>
                <p className="font-medium">开机启动</p>
                <p className="text-sm text-zinc-500">开机时自动启动祖谱服务</p>
              </div>
            </div>
            <button
              onClick={() => setAutoStart(!autoStart)}
              className={`relative w-12 h-6 rounded-full transition-colors ${
                autoStart ? 'bg-green-500' : 'bg-zinc-300'
              }`}
            >
              <span
                className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                  autoStart ? 'left-7' : 'left-1'
                }`}
              />
            </button>
          </div>
        </div>

        {/* 数据库存储路径 */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-zinc-700">数据存储</h3>
          <div className="p-4 border rounded-lg">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                <HardDrive className="w-5 h-5 text-blue-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <p className="font-medium">本地数据库路径</p>
                  {dbPathInfo && (
                    <Badge variant="outline" className="text-xs">
                      {getOsDisplayName(dbPathInfo.os_type)}
                    </Badge>
                  )}
                </div>
                {dbPathInfo ? (
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-zinc-500 break-all">{dbPathInfo.path}</p>
                    <button
                      onClick={() => copyToClipboard(dbPathInfo.path)}
                      className="shrink-0 p-1.5 rounded-lg hover:bg-zinc-100 transition-colors"
                      title="复制路径"
                    >
                      {copied ? (
                        <Check className="w-4 h-4 text-green-600" />
                      ) : (
                        <Copy className="w-4 h-4 text-zinc-400" />
                      )}
                    </button>
                  </div>
                ) : (
                  <p className="text-sm text-zinc-400">加载中...</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 端口设置 */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-zinc-700">端口设置</h3>
          <div className="space-y-4">
            <div className="grid gap-2">
              <label className="text-sm text-zinc-600">HTTP 端口</label>
              <Input
                type="number"
                value={httpPort}
                onChange={(e) => setHttpPort(e.target.value)}
                placeholder="8080"
                className="max-w-xs"
              />
              <p className="text-xs text-zinc-400">用于局域网访问祖谱服务</p>
            </div>
            <div className="grid gap-2">
              <label className="text-sm text-zinc-600">HTTPS 端口</label>
              <Input
                type="number"
                value={httpsPort}
                onChange={(e) => setHttpsPort(e.target.value)}
                placeholder="8443"
                className="max-w-xs"
              />
              <p className="text-xs text-zinc-400">用于安全连接（需配置证书）</p>
            </div>
          </div>
        </div>

        <div className="pt-4 border-t">
          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="gap-2 bg-gray-900 hover:bg-gray-800"
          >
            {isSaving ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            保存设置
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function IntranetPenetration() {
  const [isEnabled, setIsEnabled] = useState(false)
  const [subdomain, setSubdomain] = useState('')
  const [isConnected, setIsConnected] = useState(false)
  const [isPlatinum] = useState(false) // TODO: 从后端获取
  const [frpcInstalled] = useState(false) // TODO: 从后端获取

  const handleConnect = () => {
    console.log('连接内网穿透服务...')
  }

  const handleDisconnect = () => {
    setIsConnected(false)
  }

  // 未开通白金版
  if (!isPlatinum) {
    return (
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <Network className="w-5 h-5" />
            内网穿透
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6 max-w-xl">
          <div className="p-6 bg-gradient-to-r from-yellow-50 to-orange-50 border border-yellow-200 rounded-lg">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center">
                <Crown className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-zinc-900">需要开通白金版</h3>
                <p className="text-sm text-zinc-600">内网穿透功能需要白金版支持</p>
              </div>
            </div>
            <div className="space-y-2 text-sm text-zinc-600 mb-4">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-green-600" />
                <span>无限内网穿透流量</span>
              </div>
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-green-600" />
                <span>自定义二级域名</span>
              </div>
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-green-600" />
                <span>优先客服支持</span>
              </div>
            </div>
            <Button className="gap-2 bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-white border-0">
              <Crown className="w-4 h-4" />
              扫码升级
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  // frpc 未安装
  if (!frpcInstalled) {
    return (
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <Network className="w-5 h-5" />
            内网穿透
            <Badge variant="outline" className="ml-2 text-xs">
              插件未安装
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6 max-w-xl">
          <div className="p-6 bg-zinc-50 border border-zinc-200 rounded-lg">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-zinc-200 flex items-center justify-center">
                <RefreshCw className="w-6 h-6 text-zinc-500" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-zinc-900">frpc 插件未安装</h3>
                <p className="text-sm text-zinc-600">请先安装 frpc 插件以使用内网穿透功能</p>
              </div>
            </div>
            <div className="space-y-2 text-sm text-zinc-600 mb-4 p-3 bg-white rounded border">
              <p className="font-medium">安装步骤：</p>
              <p>1. 下载 frpc 插件</p>
              <p>2. 将 frpc 放置在应用目录下</p>
              <p>3. 重启应用</p>
            </div>
            <Button className="gap-2 bg-gray-900 hover:bg-gray-800">
              <Download className="w-4 h-4" />
              下载 frpc 插件
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  // 正常配置界面
  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <Network className="w-5 h-5" />
          内网穿透
          <Badge variant="outline" className="ml-2 text-xs">
            {isConnected ? '已连接' : '未连接'}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6 max-w-xl">
        <div className="p-4 bg-zinc-50 rounded-lg">
          <p className="text-sm text-zinc-600">
            配置二级域名后，您可以通过互联网远程访问您的祖谱。例如您的域名为 genealogy-tree.com，配置二级域名 myfamily，则访问地址为 https://myfamily.genealogy-tree.com
          </p>
        </div>

        {/* 启用开关 */}
        <div className="flex items-center justify-between p-4 border rounded-lg">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isEnabled ? 'bg-green-100' : 'bg-zinc-100'}`}>
              <Wifi className={`w-5 h-5 ${isEnabled ? 'text-green-600' : 'text-zinc-400'}`} />
            </div>
            <div>
              <p className="font-medium">启用内网穿透</p>
              <p className="text-sm text-zinc-500">通过互联网访问祖谱</p>
            </div>
          </div>
          <button
            onClick={() => setIsEnabled(!isEnabled)}
            className={`relative w-12 h-6 rounded-full transition-colors ${
              isEnabled ? 'bg-green-500' : 'bg-zinc-300'
            }`}
          >
            <span
              className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                isEnabled ? 'left-7' : 'left-1'
              }`}
            />
          </button>
        </div>

        {/* 插件状态 */}
        <div className="p-4 border rounded-lg">
          <p className="text-sm font-medium text-zinc-700 mb-3">插件状态</p>
          <div className="flex items-center gap-2 text-sm">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-green-600">frpc 已安装</span>
            <span className="text-zinc-400 mx-2">|</span>
            <span className="text-zinc-500">v0.58.0</span>
          </div>
        </div>

        {isEnabled && (
          <>
            {/* 二级域名配置 */}
            <div className="space-y-4">
              <div className="grid gap-2">
                <label className="text-sm text-zinc-600">二级域名</label>
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="请输入二级域名"
                    value={subdomain}
                    onChange={(e) => setSubdomain(e.target.value)}
                    className="max-w-xs"
                  />
                  <span className="text-sm text-zinc-500">.genealogy-tree.com</span>
                </div>
                <p className="text-xs text-zinc-400">例如：myfamily，完整地址为 https://myfamily.genealogy-tree.com</p>
              </div>
            </div>

            {/* 连接状态 */}
            <div className="p-4 border rounded-lg space-y-3">
              <p className="text-sm font-medium text-zinc-700">连接状态</p>
              <div className="flex items-center gap-2 text-sm">
                <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-zinc-300'}`} />
                <span className={isConnected ? 'text-green-600' : 'text-zinc-500'}>
                  {isConnected ? '已连接' : '未连接'}
                </span>
              </div>
              {isConnected && (
                <div className="p-3 bg-green-50 border border-green-200 rounded text-sm">
                  <p className="text-green-700">您的祖谱已上线！</p>
                  <p className="font-mono text-green-600 mt-1">
                    https://{subdomain || 'your-subdomain'}.genealogy-tree.com
                  </p>
                </div>
              )}
            </div>

            {/* 操作按钮 */}
            <div className="flex gap-3">
              {!isConnected ? (
                <Button
                  onClick={handleConnect}
                  className="gap-2 bg-gray-900 hover:bg-gray-800"
                >
                  <RefreshCw className="w-4 h-4" />
                  连接
                </Button>
              ) : (
                <Button
                  onClick={handleDisconnect}
                  variant="outline"
                  className="gap-2"
                >
                  断开连接
                </Button>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function UpdateSettings() {
  const { updateInfo, downloading, downloadProgress, checkForUpdates, startUpdate, clearDismissedVersion, error } = useUpdateChecker()
  const [currentVersion, setCurrentVersion] = useState('0.0.0')
  const [isChecking, setIsChecking] = useState(false)

  useEffect(() => {
    getVersion().then(version => setCurrentVersion(version)).catch(() => {})
  }, [])

  const handleCheckUpdate = async () => {
    setIsChecking(true)
    try {
      clearDismissedVersion()
      await checkForUpdates()
    } finally {
      setIsChecking(false)
    }
  }

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <RefreshCw className="w-5 h-5" />
          版本更新
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6 max-w-xl">
        <div className="p-4 border rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                <Zap className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <p className="font-medium text-zinc-900">当前版本</p>
                <p className="text-sm text-zinc-500">v{currentVersion}</p>
              </div>
            </div>
            <Button
              variant="outline"
              className="gap-2"
              onClick={handleCheckUpdate}
              disabled={downloading || isChecking}
            >
              <RefreshCw className={cn("w-4 h-4", isChecking && "animate-spin")} />
              {isChecking ? '检查中...' : '检查更新'}
            </Button>
          </div>
        </div>

        {updateInfo && !downloading && (
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg space-y-4">
            <div>
              <p className="font-medium text-blue-900">发现新版本：v{updateInfo.version}</p>
              {updateInfo.notes && (
                <p className="text-sm text-blue-700 mt-2">{updateInfo.notes}</p>
              )}
              {updateInfo.pub_date && (
                <p className="text-xs text-blue-500 mt-1">发布日期：{updateInfo.pub_date}</p>
              )}
            </div>
            <Button
              className="w-full gap-2 bg-blue-600 hover:bg-blue-700"
              onClick={startUpdate}
            >
              <Download className="w-4 h-4" />
              立即更新
            </Button>
          </div>
        )}

        {downloading && (
          <div className="p-4 bg-green-50 border border-green-200 rounded-lg space-y-3">
            <div className="flex items-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin text-green-600" />
              <p className="font-medium text-green-900">正在下载更新...</p>
            </div>
            <div className="w-full bg-green-200 rounded-full h-2">
              <div
                className="bg-green-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${downloadProgress}%` }}
              />
            </div>
            <p className="text-sm text-green-700 text-center">{downloadProgress.toFixed(1)}%</p>
          </div>
        )}

        {!updateInfo && !downloading && !isChecking && error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {!updateInfo && !downloading && !isChecking && !error && (
          <div className="p-4 bg-zinc-50 border border-zinc-200 rounded-lg">
            <p className="text-sm text-zinc-600">已是最新版本</p>
          </div>
        )}

        <div className="p-4 border rounded-lg">
          <p className="text-sm font-medium text-zinc-700 mb-2">自动更新说明</p>
          <ul className="text-sm text-zinc-500 space-y-1">
            <li>• 启动时会自动检查更新</li>
            <li>• 点击"稍后更新"将跳过本次更新提示</li>
            <li>• 可随时点击"检查更新"手动检查</li>
            <li>• 下载完成后将自动安装并重启</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  )
}

function PlatinumSettings() {
  const [isWechatLoggedIn, setIsWechatLoggedIn] = useState(false)
  const [wechatUser, setWechatUser] = useState('')
  const [isPaid] = useState(false) // TODO: 从后端获取
  const { logout } = useAuthStore()

  // 微信登录相关状态
  const [showQrcode, setShowQrcode] = useState(false)
  const [qrcodeUrl, setQrcodeUrl] = useState('')
  const [qrcodeScene, setQrcodeScene] = useState('')
  const [scanStatus, setScanStatus] = useState<'pending' | 'scanned' | 'confirmed' | 'expired'>('pending')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const pollingRef = useRef<number | null>(null)

  // 清理轮询
  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
      }
    }
  }, [])

  // 生成二维码
  const handleGenerateQrcode = async () => {
    setIsLoading(true)
    setError('')
    setScanStatus('pending')

    try {
      const result = await wechatApi.generateQrcode()
      if (result.data) {
        // 先生成二维码，成功后再显示弹窗
        setQrcodeUrl(result.data.qrcode_url)
        setQrcodeScene(result.data.scene)
        setShowQrcode(true)
        // 开始轮询状态
        startPolling(result.data.scene)
      } else {
        setError(result.error || '生成二维码失败')
        setShowQrcode(false)
      }
    } catch (err) {
      setError('网络错误')
      setShowQrcode(false)
    }
    setIsLoading(false)
  }

  // 轮询登录状态
  const startPolling = (scene: string) => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current)
    }

    pollingRef.current = window.setInterval(async () => {
      try {
        const result = await wechatApi.checkStatus(scene)
        if (result.data) {
          setScanStatus(result.data.status as typeof scanStatus)

          if (result.data.status === 'confirmed') {
            // 登录成功
            if (pollingRef.current) {
              clearInterval(pollingRef.current)
            }
            // 保存 token
            if (result.data.nickname) {
              localStorage.setItem('wechat_nickname', result.data.nickname)
              setWechatUser(result.data.nickname)
              setIsWechatLoggedIn(true)
              setShowQrcode(false)
            }
          } else if (result.data.status === 'expired') {
            if (pollingRef.current) {
              clearInterval(pollingRef.current)
            }
          }
        }
      } catch (err) {
        console.error('轮询错误:', err)
      }
    }, 2000)
  }

  // 模拟扫码确认（用于测试）
  const handleSimulateScan = async () => {
    if (!qrcodeScene) return
    try {
      await wechatApi.confirmLogin(qrcodeScene, 'mock_openid_' + Date.now(), '测试用户')
    } catch (err) {
      console.error('模拟扫码失败:', err)
    }
  }

  // 关闭二维码
  const handleCloseQrcode = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current)
    }
    setShowQrcode(false)
    setQrcodeScene('')
    setQrcodeUrl('')
    setScanStatus('pending')
  }

  // 退出微信登录（同时退出应用登录，清除自动登录凭据）
  const handleWechatLogout = () => {
    // 清除所有登录状态，包括自动登录凭据
    logout()
    setWechatUser('')
    setIsWechatLoggedIn(false)
  }

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <Crown className="w-5 h-5 text-yellow-500" />
          白金版
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* 左右布局 */}
        <div className="grid grid-cols-2 gap-6">
          {/* 左侧：当前版本 + 微信登录 */}
          <div className="space-y-6">
            {/* 当前版本状态 */}
            <div className="p-4 border rounded-lg">
              <p className="text-sm font-medium text-zinc-700 mb-3">当前版本</p>
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                  isPaid ? 'bg-gradient-to-br from-yellow-400 to-orange-500' : 'bg-zinc-200'
                }`}>
                  {isPaid ? (
                    <Crown className="w-6 h-6 text-white" />
                  ) : (
                    <Zap className="w-6 h-6 text-zinc-500" />
                  )}
                </div>
                <div>
                  <p className={`font-semibold ${isPaid ? 'text-yellow-600' : 'text-zinc-600'}`}>
                    {isPaid ? '白金版' : '免费版'}
                  </p>
                  <p className="text-sm text-zinc-500">
                    {isPaid ? '已激活全部高级功能' : '当前版本功能受限'}
                  </p>
                </div>
              </div>
            </div>

            {/* 微信登录状态 */}
            <div className="p-4 border rounded-lg">
              <p className="text-sm font-medium text-zinc-700 mb-3">微信登录</p>
              {isWechatLoggedIn ? (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                      <span className="text-green-600 font-medium">微</span>
                    </div>
                    <div>
                      <p className="font-medium text-zinc-900">微信用户</p>
                      <p className="text-sm text-zinc-500">{wechatUser}</p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" onClick={handleWechatLogout}>
                    退出
                  </Button>
                </div>
              ) : (
                <div className="text-center py-4">
                  <p className="text-sm text-zinc-500 mb-4">请先微信扫码登录，以便我们确认您的身份</p>
                  <Button className="gap-2 bg-green-600 hover:bg-green-700" onClick={handleGenerateQrcode} disabled={isLoading}>
                    {isLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <span className="text-lg">微</span>}
                    微信扫码登录
                  </Button>
                  {error && (
                    <p className="text-sm text-red-500 mt-2">{error}</p>
                  )}
                </div>
              )}
            </div>

            {/* 二维码弹窗 */}
            {showQrcode && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                <Card className="w-80 border-0 shadow-xl">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base flex items-center gap-2">
                        <QrCode className="w-5 h-5" />
                        微信扫码登录
                      </CardTitle>
                      <button onClick={handleCloseQrcode} className="text-zinc-400 hover:text-zinc-600">✕</button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* 二维码 */}
                    <div className="flex justify-center bg-white p-4 rounded-lg">
                      {qrcodeUrl ? (
                        <img
                          src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrcodeUrl)}`}
                          alt="QR Code"
                          className="w-48 h-48"
                        />
                      ) : (
                        <div className="w-48 h-48 flex items-center justify-center bg-zinc-100">
                          <RefreshCw className="w-8 h-8 animate-spin text-zinc-400" />
                        </div>
                      )}
                    </div>

                    {/* 状态提示 */}
                    <div className="text-center">
                      {scanStatus === 'pending' && (
                        <p className="text-sm text-zinc-500">请使用微信扫描二维码</p>
                      )}
                      {scanStatus === 'scanned' && (
                        <p className="text-sm text-yellow-600">已扫码，请确认登录</p>
                      )}
                      {scanStatus === 'confirmed' && (
                        <p className="text-sm text-green-600 flex items-center justify-center gap-1">
                          <Check className="w-4 h-4" />
                          登录成功
                        </p>
                      )}
                      {scanStatus === 'expired' && (
                        <p className="text-sm text-red-500">二维码已过期，请重新生成</p>
                      )}
                    </div>

                    {error && (
                      <p className="text-sm text-red-500 text-center">{error}</p>
                    )}

                    {/* 测试用：模拟扫码按钮 */}
                    <div className="border-t pt-4">
                      <p className="text-xs text-zinc-400 text-center mb-2">测试用按钮（实际使用微信扫一扫）</p>
                      <Button variant="outline" className="w-full gap-2" onClick={handleSimulateScan} size="sm">
                        模拟扫码确认
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>

          {/* 右侧：升级/已付费 + 联系客服 */}
          <div className="space-y-6">
            {/* 升级白金版 - 仅未付费用户显示 */}
            {!isPaid ? (
              <div className="p-6 bg-gradient-to-r from-yellow-50 to-orange-50 border border-yellow-200 rounded-lg">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center">
                    <Crown className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-zinc-900">升级到白金版</h3>
                    <p className="text-sm text-zinc-600">解锁全部高级功能</p>
                  </div>
                </div>

                <div className="space-y-2 mb-4">
                  <div className="flex items-center gap-2 text-sm">
                    <Shield className="w-4 h-4 text-green-600" />
                    <span>无限家族成员数量</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Shield className="w-4 h-4 text-green-600" />
                    <span>无限内网穿透流量</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Shield className="w-4 h-4 text-green-600" />
                    <span>自定义域名绑定</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Shield className="w-4 h-4 text-green-600" />
                    <span>优先客服支持</span>
                  </div>
                </div>

                <div className="border-t pt-4 mt-4">
                  <p className="text-sm text-zinc-600 mb-3">扫码支付开通白金版</p>
                  <Button
                    className="gap-2 bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-white border-0"
                    disabled={!isWechatLoggedIn}
                  >
                    <span className="text-lg">微</span>
                    微信扫码支付
                  </Button>
                  {!isWechatLoggedIn && (
                    <p className="text-xs text-zinc-400 mt-2">请先登录微信后再支付</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                    <Crown className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <p className="font-medium text-green-700">您已是白金版用户</p>
                    <p className="text-sm text-green-600">感谢您的支持，尽情使用全部高级功能吧！</p>
                  </div>
                </div>
              </div>
            )}

            {/* 联系客服 */}
            <div className="p-4 border rounded-lg">
              <p className="text-sm font-medium text-zinc-700 mb-3">联系客服</p>
              <div className="flex items-center gap-4">
                <Button variant="outline" className="gap-2">
                  <span className="text-lg">微</span>
                  微信客服
                </Button>
                <Button variant="outline" className="gap-2">
                  <span>📧</span>
                  邮箱联系
                </Button>
              </div>
              <p className="text-xs text-zinc-400 mt-3">
                工作时间：周一至周五 9:00-18:00
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function LicenseSettings() {
  const [licenseInfo, setLicenseInfo] = useState<LicenseInfo | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showActivateDialog, setShowActivateDialog] = useState(false)
  const [isVerifying, setIsVerifying] = useState(false)

  const fetchLicenseInfo = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const result = await licenseApi.getInfo()
      console.log('[Settings] fetchLicenseInfo result:', result)
      if (result.data) {
        console.log('[Settings] Setting licenseInfo:', result.data)
        setLicenseInfo(result.data)
      } else if (result.error) {
        setError(result.error)
      }
    } catch (err) {
      setError('获取授权信息失败')
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchLicenseInfo()
  }, [fetchLicenseInfo])

  const handleVerify = async () => {
    setIsVerifying(true)
    try {
      const result = await licenseApi.verify()
      if (result.data?.valid) {
        await fetchLicenseInfo()
      } else {
        setError(result.error || '验证失败')
      }
    } catch (err) {
      setError('验证请求失败')
      console.error(err)
    } finally {
      setIsVerifying(false)
    }
  }

  const handleActivationSuccess = () => {
    setShowActivateDialog(false)
    // 等待 500ms 后重新从服务器获取授权信息
    setTimeout(() => {
      fetchLicenseInfo()
    }, 500)
  }

  // 解析日期字符串
  const parseDate = (dateStr?: string): Date | null => {
    if (!dateStr) return null
    // 先尝试直接解析（ISO 格式）
    let date = new Date(dateStr)
    if (!isNaN(date.getTime())) return date
    // 再尝试替换空格为 T（国内格式 "YYYY-MM-DD HH:MM:SS"）
    date = new Date(dateStr.replace(' ', 'T'))
    if (!isNaN(date.getTime())) return date
    // 最后尝试手动解析
    const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})(?:[\sT](\d{2}):(\d{2}):(\d{2}))?$/)
    if (match) {
      const [, year, month, day, hour = '0', minute = '0', second = '0'] = match
      date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(hour), parseInt(minute), parseInt(second))
      if (!isNaN(date.getTime())) return date
    }
    console.log('[License] parseDate failed:', dateStr)
    return null
  }

  // 检查授权是否真正过期
  const isExpired = (expiresAt?: string): boolean => {
    const date = parseDate(expiresAt)
    if (!date) return false
    return date < new Date()
  }

  const getLicenseTypeDisplay = (licenseType?: string, expiresAt?: string, isTrial?: boolean) => {
    const expired = isExpired(expiresAt)
    if (expired) return <Badge variant="danger">已过期</Badge>
    if (isTrial) return <Badge variant="warning">试用期</Badge>
    switch (licenseType) {
      case 'year': return <Badge variant="success">年度授权</Badge>
      case 'permanent': return <Badge variant="success">永久授权</Badge>
      case 'custom': return <Badge variant="warning">自定义授权</Badge>
      default: return <Badge variant="outline">未激活</Badge>
    }
  }

  // 判断授权是否有效（考虑过期）
  const checkLicenseValid = (info: LicenseInfo | null): boolean => {
    if (!info?.is_valid) return false
    if (info.license_type === 'permanent') return true
    if (info.expires_at) return !isExpired(info.expires_at)
    return true
  }

  const getRemainingDays = (expiresAt?: string): number | null => {
    const date = parseDate(expiresAt)
    if (!date) return null
    const now = new Date()
    const diff = date.getTime() - now.getTime()
    return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)))
  }

  if (isLoading) {
    return (
      <Card className="border-0 shadow-sm">
        <CardContent className="flex items-center justify-center h-64">
          <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <Key className="w-5 h-5" />
          授权管理
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6 max-w-2xl">
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            {error}
          </div>
        )}

        <div className="p-4 border rounded-lg">
          <p className="text-sm font-medium text-zinc-700 mb-3">当前授权状态</p>
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
              checkLicenseValid(licenseInfo) ? 'bg-green-100' : 'bg-red-100'
            }`}>
              <Key className={`w-6 h-6 ${checkLicenseValid(licenseInfo) ? 'text-green-600' : 'text-red-600'}`} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="font-medium">{licenseInfo?.license_key || '未激活'}</p>
                {getLicenseTypeDisplay(licenseInfo?.license_type, licenseInfo?.expires_at, licenseInfo?.is_trial)}
              </div>
              <p className="text-sm text-zinc-500">
                {checkLicenseValid(licenseInfo) ? '授权有效' : '授权已过期'}
              </p>
            </div>
          </div>
        </div>

        {licenseInfo?.license_key && (
          <div className="p-4 border rounded-lg space-y-3">
            {licenseInfo.activated_at && (
              <div className="flex justify-between text-sm">
                <span className="text-zinc-500">激活时间</span>
                <span>{licenseInfo.activated_at}</span>
              </div>
            )}
            {licenseInfo.expires_at && (
              <div className="flex justify-between text-sm">
                <span className="text-zinc-500">到期时间</span>
                <span>{licenseInfo.expires_at}</span>
              </div>
            )}
            {licenseInfo?.license_type === 'year' && licenseInfo?.expires_at && (
              <div className="flex justify-between text-sm">
                <span className="text-zinc-500">剩余天数</span>
                <span className={isExpired(licenseInfo.expires_at) ? 'text-red-600' : 'font-medium text-green-600'}>
                  {isExpired(licenseInfo.expires_at) ? '已过期' : `${getRemainingDays(licenseInfo.expires_at)} 天`}
                </span>
              </div>
            )}
            {licenseInfo?.license_type === 'permanent' && (
              <div className="flex justify-between text-sm">
                <span className="text-zinc-500">有效期</span>
                <span className="font-medium text-green-600">永久有效</span>
              </div>
            )}
            {licenseInfo?.is_trial && licenseInfo?.expires_at && (
              <div className="flex justify-between text-sm">
                <span className="text-zinc-500">试用期剩余</span>
                <span className={isExpired(licenseInfo.expires_at) ? 'text-red-600' : 'font-medium text-blue-600'}>
                  {isExpired(licenseInfo.expires_at) ? '已过期' : `${getRemainingDays(licenseInfo.expires_at)} 天`}
                </span>
              </div>
            )}
            {licenseInfo?.license_type === 'custom' && licenseInfo?.expires_at && (
              <div className="flex justify-between text-sm">
                <span className="text-zinc-500">剩余天数</span>
                <span className={isExpired(licenseInfo.expires_at) ? 'text-red-600' : 'font-medium text-green-600'}>
                  {isExpired(licenseInfo.expires_at) ? '已过期' : `${getRemainingDays(licenseInfo.expires_at)} 天`}
                </span>
              </div>
            )}
          </div>
        )}

        <div className="flex gap-3 flex-wrap">
          {licenseInfo?.is_trial && !isExpired(licenseInfo.expires_at) ? (
            <div className="text-sm text-zinc-500">
              试用期授权已自动激活，如需正式授权请联系客服购买
            </div>
          ) : licenseInfo?.is_trial && isExpired(licenseInfo.expires_at) ? (
            <>
              <div className="text-sm text-red-600">
                试用期已过期，请购买正式授权
              </div>
              <Button onClick={() => setShowActivateDialog(true)} className="gap-2">
                <Key className="w-4 h-4" />
                输入许可证
              </Button>
            </>
          ) : licenseInfo?.license_key ? (
            <>
              <Button onClick={handleVerify} disabled={isVerifying} className="gap-2">
                {isVerifying && <RefreshCw className="w-4 h-4 animate-spin" />}
                验证授权
              </Button>
              <Button onClick={() => setShowActivateDialog(true)} variant="outline" className="gap-2">
                <Key className="w-4 h-4" />
                重新授权
              </Button>
            </>
          ) : (
            <Button onClick={() => setShowActivateDialog(true)} className="gap-2">
              <Key className="w-4 h-4" />
              激活授权
            </Button>
          )}
        </div>

        <LicenseDialog
          open={showActivateDialog}
          onOpenChange={setShowActivateDialog}
          onSuccess={handleActivationSuccess}
        />
      </CardContent>
    </Card>
  )
}
