import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TreeDeciduous, Loader2, Eye, EyeOff, Check } from 'lucide-react'
import { authApi } from '@/api/client'
import { useAuthStore } from '@/stores'

// 通过自定义 User-Agent 检测是否为桌面端（WebView）
const isDesktop = typeof window !== 'undefined' &&
  navigator.userAgent.includes('GenealogyDesktop')

// localStorage keys
const STORAGE_KEY_REMEMBER = 'genealogy_remember'

interface RememberedCredentials {
  username: string
  password: string
  autoLogin: boolean
}

export function LoginPage() {
  const navigate = useNavigate()
  const { setAuth } = useAuthStore()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [isLoginMode, setIsLoginMode] = useState(true)
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const [formData, setFormData] = useState({
    username: '',
    password: '',
  })

  // 页面加载时，检查是否有保存的凭据并进行自动登录
  useEffect(() => {
    const savedCredentials = localStorage.getItem(STORAGE_KEY_REMEMBER)
    if (savedCredentials) {
      try {
        const credentials: RememberedCredentials = JSON.parse(savedCredentials)
        setFormData({
          username: credentials.username,
          password: credentials.password,
        })
        setRememberMe(credentials.autoLogin)

        // 如果设置了自动登录，且有保存的密码，则自动登录
        if (credentials.autoLogin && credentials.username && credentials.password) {
          handleAutoLogin(credentials.username, credentials.password)
        }
      } catch {
        localStorage.removeItem(STORAGE_KEY_REMEMBER)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 自动登录处理
  const handleAutoLogin = async (username: string, password: string) => {
    setIsLoading(true)
    setError('')

    try {
      const result = await authApi.login(username, password)
      if (result.error) {
        setError(result.error)
        setIsLoading(false)
        return
      }
      if (result.data) {
        setAuth(result.data.user, result.data.token)
        navigate('/')
      }
    } catch {
      setError('请求失败，请稍后重试')
      setIsLoading(false)
    }
  }

  // 保存凭据到 localStorage
  const saveCredentials = (username: string, password: string, autoLogin: boolean) => {
    const credentials: RememberedCredentials = {
      username,
      password,
      autoLogin,
    }
    localStorage.setItem(STORAGE_KEY_REMEMBER, JSON.stringify(credentials))
  }

  // 清除保存的凭据
  const clearCredentials = () => {
    localStorage.removeItem(STORAGE_KEY_REMEMBER)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!formData.username || !formData.password) {
      setError('请输入用户名和密码')
      return
    }

    if (formData.password.length < 6) {
      setError('密码长度至少6位')
      return
    }

    setIsLoading(true)

    try {
      if (isLoginMode) {
        const result = await authApi.login(formData.username, formData.password)

        if (result.error) {
          setError(result.error)
          setIsLoading(false)
          return
        }

        if (result.data) {
          // 保存凭据
          if (rememberMe) {
            saveCredentials(formData.username, formData.password, rememberMe)
          } else {
            clearCredentials()
          }
          setAuth(result.data.user, result.data.token)
          navigate('/')
        }
      } else {
        const result = await authApi.register({
          username: formData.username,
          password: formData.password,
          role: 'admin',
        })

        if (result.error) {
          setError(result.error)
          setIsLoading(false)
          return
        }

        if (result.data) {
          // 保存凭据
          if (rememberMe) {
            saveCredentials(formData.username, formData.password, rememberMe)
          } else {
            clearCredentials()
          }
          setAuth(result.data.user, result.data.token)
          navigate('/')
        }
      }
    } catch {
      setError('请求失败，请稍后重试')
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-xl flex items-center justify-center mx-auto mb-4 shadow-2xl">
            <TreeDeciduous className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">祖谱</h1>
        </div>

        <Card className="border-0 shadow-2xl">
          <CardHeader className="text-center pb-2">
            <CardTitle className="text-xl">
              {isLoginMode ? '登录' : '创建管理员账号'}
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {isLoginMode ? '欢迎回来，请登录您的账号' : '首次使用，请创建管理员账号'}
            </p>
          </CardHeader>
          <CardContent className="pt-4">
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm">
                  {error}
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium">用户名</label>
                <Input
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  placeholder="输入用户名"
                  disabled={isLoading}
                  autoComplete="username"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">密码</label>
                <div className="relative">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder="输入密码"
                    disabled={isLoading}
                    autoComplete={isLoginMode ? 'current-password' : 'new-password'}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* 记住我复选框 */}
              <div className="flex items-center">
                <button
                  type="button"
                  onClick={() => setRememberMe(!rememberMe)}
                  className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                    rememberMe
                      ? 'bg-indigo-600 border-indigo-600'
                      : 'bg-white border-gray-300 hover:border-gray-400'
                  }`}
                  disabled={isLoading}
                >
                  {rememberMe && <Check className="w-3 h-3 text-white" />}
                </button>
                <label
                  onClick={() => !isLoading && setRememberMe(!rememberMe)}
                  className="ml-2 text-sm text-gray-600 cursor-pointer select-none"
                >
                  记住账号密码并自动登录
                </label>
              </div>

              <Button
                type="submit"
                disabled={isLoading}
                className="w-full h-11 bg-gray-900 hover:bg-gray-800"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {isLoginMode ? '登录中...' : '创建中...'}
                  </>
                ) : isLoginMode ? (
                  '登录'
                ) : (
                  '创建账号'
                )}
              </Button>
            </form>

            {/* 桌面端显示注册切换按钮 */}
            {isDesktop && (
              <div className="mt-6 text-center">
                {isLoginMode ? (
                  <button
                    type="button"
                    onClick={() => {
                      setIsLoginMode(false)
                      setError('')
                      setFormData({ username: '', password: '' })
                      clearCredentials()
                    }}
                    className="text-sm text-indigo-600 hover:text-indigo-700 font-medium"
                  >
                    首次使用？创建管理员账号
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setIsLoginMode(true)
                      setError('')
                      setFormData({ username: '', password: '' })
                    }}
                    className="text-sm text-indigo-600 hover:text-indigo-700 font-medium"
                  >
                    已有账号？去登录
                  </button>
                )}
              </div>
            )}

            {/* 浏览器访问时显示提示 */}
            {!isDesktop && (
              <div className="mt-4 p-3 rounded-lg bg-amber-50 border border-amber-200">
                <p className="text-xs text-amber-800">
                  <strong>提示：</strong>如果您是首次使用，请联系管理员创建账号。
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
