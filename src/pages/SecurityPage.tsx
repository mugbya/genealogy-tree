import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Shield,
  Zap,
  History,
  Eye,
  EyeOff,
  LogOut,
  AlertTriangle,
  Check,
  RefreshCw,
} from 'lucide-react'
import { securityApi, LoginHistoryItem } from '@/api/client'
import { useAuthStore } from '@/stores'

export function SecurityPage() {
  const { user } = useAuthStore()
  const isAdmin = user?.role === 'admin'

  // 修改密码状态
  const [showOldPassword, setShowOldPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [passwordSuccess, setPasswordSuccess] = useState('')
  const [isChangingPassword, setIsChangingPassword] = useState(false)

  // 登录历史状态
  const [loginHistory, setLoginHistory] = useState<LoginHistoryItem[]>([])
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)

  // 强制登出状态
  const [isRevoking, setIsRevoking] = useState(false)
  const [revokeMessage, setRevokeMessage] = useState('')

  // 加载登录历史
  useEffect(() => {
    loadLoginHistory()
  }, [])

  const loadLoginHistory = async () => {
    setIsLoadingHistory(true)
    try {
      const result = await securityApi.getLoginHistory()
      if (result.data) {
        setLoginHistory(result.data)
      }
    } catch (err) {
      console.error('加载登录历史失败:', err)
    }
    setIsLoadingHistory(false)
  }

  // 修改密码
  const handleChangePassword = async () => {
    setPasswordError('')
    setPasswordSuccess('')

    if (!oldPassword) {
      setPasswordError('请输入旧密码')
      return
    }
    if (!newPassword) {
      setPasswordError('请输入新密码')
      return
    }
    if (newPassword.length < 6) {
      setPasswordError('新密码长度不能少于6位')
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('两次输入的新密码不一致')
      return
    }

    setIsChangingPassword(true)
    try {
      const result = await securityApi.changePassword(user!.id, {
        old_password: oldPassword,
        new_password: newPassword,
      })
      if (result.error) {
        setPasswordError(result.error)
      } else {
        setPasswordSuccess('密码修改成功！')
        setOldPassword('')
        setNewPassword('')
        setConfirmPassword('')
      }
    } catch (err) {
      setPasswordError('修改密码失败，请稍后重试')
    }
    setIsChangingPassword(false)
  }

  // 强制登出所有用户
  const handleRevokeAll = async () => {
    if (!confirm('确定要强制所有用户登出吗？所有用户都需要重新登录。')) {
      return
    }

    setIsRevoking(true)
    setRevokeMessage('')
    try {
      const result = await securityApi.revokeAllTokens()
      if (result.data?.success) {
        setRevokeMessage('已强制所有用户登出')
        loadLoginHistory()
      } else {
        setRevokeMessage(result.error || '操作失败')
      }
    } catch (err) {
      setRevokeMessage('操作失败，请稍后重试')
    }
    setIsRevoking(false)
  }

  const formatDate = (dateStr: string) => {
    // 处理 SQLite 返回的 datetime 格式 (如 "2026-04-16 14:43:43")
    // 转换为本地时间显示
    const date = new Date(dateStr.replace(' ', 'T') + 'Z')
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/25">
          <Shield className="w-7 h-7 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">安全中心</h1>
          <p className="text-sm text-zinc-500">管理您的账号安全设置</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 修改密码 */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <Zap className="w-5 h-5" />
              修改密码
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {passwordSuccess && (
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
                {passwordSuccess}
              </div>
            )}
            {passwordError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {passwordError}
              </div>
            )}

            {/* 旧密码 */}
            <div className="space-y-2">
              <label className="text-sm text-zinc-600">旧密码</label>
              <div className="relative">
                <Input
                  type={showOldPassword ? 'text' : 'password'}
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  placeholder="请输入旧密码"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowOldPassword(!showOldPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
                >
                  {showOldPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* 新密码 */}
            <div className="space-y-2">
              <label className="text-sm text-zinc-600">新密码</label>
              <div className="relative">
                <Input
                  type={showNewPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="请输入新密码（至少6位）"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
                >
                  {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* 确认新密码 */}
            <div className="space-y-2">
              <label className="text-sm text-zinc-600">确认新密码</label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="请再次输入新密码"
              />
            </div>

            <Button
              onClick={handleChangePassword}
              disabled={isChangingPassword}
              className="gap-2 bg-gray-900 hover:bg-gray-800"
            >
              {isChangingPassword ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Zap className="w-4 h-4" />
              )}
              修改密码
            </Button>
          </CardContent>
        </Card>

        {/* 登录历史 */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <History className="w-5 h-5" />
              登录历史
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoadingHistory ? (
              <div className="p-8 text-center text-zinc-500">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
                加载中...
              </div>
            ) : loginHistory.length === 0 ? (
              <div className="p-8 text-center text-zinc-500">暂无登录历史</div>
            ) : (
              <div className="space-y-3 max-h-80 overflow-y-auto">
                {loginHistory.slice(0, 10).map((item) => (
                  <div key={item.id} className="flex items-start gap-3 p-3 border rounded-lg">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                      item.login_status === 'success'
                        ? 'bg-green-100 text-green-600'
                        : 'bg-red-100 text-red-600'
                    }`}>
                      {item.login_status === 'success' ? (
                        <Check className="w-5 h-5" />
                      ) : (
                        <AlertTriangle className="w-5 h-5" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-zinc-900">{item.username}</span>
                        <Badge variant={item.login_status === 'success' ? 'default' : 'outline'} className="text-xs">
                          {item.login_status === 'success' ? '成功' : '失败'}
                        </Badge>
                      </div>
                      <p className="text-sm text-zinc-500 mt-1">
                        {item.ip_address} · {item.user_agent ? (
                          item.user_agent.length > 50 ? item.user_agent.substring(0, 50) + '...' : item.user_agent
                        ) : '未知设备'}
                      </p>
                      {item.fail_reason && (
                        <p className="text-xs text-red-500 mt-1">失败原因: {item.fail_reason}</p>
                      )}
                      <p className="text-xs text-zinc-400 mt-1">{formatDate(item.created_at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 强制登出（仅管理员） */}
      {isAdmin && (
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <LogOut className="w-5 h-5" />
              安全管理
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="p-4 border border-red-200 rounded-lg bg-red-50 max-w-xl">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-medium text-red-900">全员强制登出</p>
                  <p className="text-sm text-red-700 mt-1">
                    强制所有用户退出登录，所有用户都需要重新输入账号密码登录。
                  </p>
                  {revokeMessage && (
                    <p className="text-sm text-green-700 mt-2">{revokeMessage}</p>
                  )}
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleRevokeAll}
                    disabled={isRevoking}
                    className="mt-3 gap-2"
                  >
                    {isRevoking ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <LogOut className="w-4 h-4" />
                    )}
                    强制所有用户登出
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
