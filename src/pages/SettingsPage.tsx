import { useState } from 'react'
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
} from 'lucide-react'

type TabType = 'general' | '穿透' | 'platinum'

const tabs = [
  { id: 'general' as TabType, label: '通用设置', icon: Settings },
  { id: '穿透' as TabType, label: '内网穿透', icon: Network },
  { id: 'platinum' as TabType, label: '白金版', icon: Crown },
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
      </div>
    </div>
  )
}

function GeneralSettings() {
  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <Settings className="w-5 h-5" />
          通用设置
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-zinc-700">家族信息</h3>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <label className="text-sm text-zinc-600">家族名称</label>
              <Input placeholder="请输入家族名称" className="max-w-md" />
            </div>
            <div className="grid gap-2">
              <label className="text-sm text-zinc-600">家族姓氏</label>
              <Input placeholder="请输入家族姓氏" className="max-w-md" />
            </div>
            <div className="grid gap-2">
              <label className="text-sm text-zinc-600">家族起源</label>
              <Input placeholder="请输入家族起源" className="max-w-md" />
            </div>
          </div>
        </div>

        <div className="pt-4 border-t">
          <Button className="gap-2 bg-gray-900 hover:bg-gray-800">
            <Save className="w-4 h-4" />
            保存设置
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function IntranetPenetration() {
  const [isEnabled, setIsEnabled] = useState(false)
  const [serverAddress, setServerAddress] = useState('')
  const [serverPort, setServerPort] = useState('')
  const [isConnected, setIsConnected] = useState(false)

  const handleConnect = () => {
    // TODO: 实现内网穿透连接逻辑
    console.log('连接内网穿透服务...')
  }

  const handleDisconnect = () => {
    setIsConnected(false)
  }

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
      <CardContent className="space-y-6">
        <div className="p-4 bg-zinc-50 rounded-lg">
          <p className="text-sm text-zinc-600">
            开启内网穿透后，您可以通过互联网远程访问您的族谱数据。扫描付费后可开通此功能。
          </p>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isEnabled ? 'bg-green-100' : 'bg-zinc-100'}`}>
                <Wifi className={`w-5 h-5 ${isEnabled ? 'text-green-600' : 'text-zinc-400'}`} />
              </div>
              <div>
                <p className="font-medium">启用内网穿透</p>
                <p className="text-sm text-zinc-500">通过互联网访问族谱</p>
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

          {isEnabled && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <label className="text-sm text-zinc-600">服务器地址</label>
                  <Input
                    placeholder="如: frp.example.com"
                    value={serverAddress}
                    onChange={(e) => setServerAddress(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <label className="text-sm text-zinc-600">服务器端口</label>
                  <Input
                    placeholder="如: 7000"
                    value={serverPort}
                    onChange={(e) => setServerPort(e.target.value)}
                  />
                </div>
              </div>

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

              {isConnected && (
                <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-sm text-green-700">
                    连接成功！您的族谱可通过以下地址访问：
                  </p>
                  <p className="mt-2 font-mono text-sm">
                    http://{serverAddress || 'your-domain.com'}:8080
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function PlatinumSettings() {
  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <Crown className="w-5 h-5 text-yellow-500" />
          白金版
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="p-6 bg-gradient-to-r from-yellow-50 to-orange-50 border border-yellow-200 rounded-lg">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center">
              <Zap className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-zinc-900">升级到白金版</h3>
              <p className="text-sm text-zinc-600">解锁全部高级功能</p>
            </div>
          </div>

          <div className="space-y-3">
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

          <div className="mt-6">
            <Button className="gap-2 bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-white border-0">
              <Crown className="w-4 h-4" />
              扫码升级
            </Button>
          </div>
        </div>

        <div className="p-4 bg-zinc-50 rounded-lg">
          <p className="text-sm text-zinc-600">
            白金版用户专享更多高级功能，包括无限成员数量、内网穿透、Custom Domain 等。扫描上方二维码即可开通。
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
