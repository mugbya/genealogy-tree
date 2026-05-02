import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, Key, AlertCircle, CheckCircle } from 'lucide-react'
import { licenseApi, LicenseStatus } from '@/api/client'

interface LicenseDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: (data: {
    license_key: string
    license_type: string
    expires_at?: string
    activated_at?: string
  }) => void
}

// 验证授权码格式（简单验证：不能为空，不能包含中文）
const validateLicenseKey = (key: string): string | null => {
  if (!key.trim()) {
    return '请输入授权码'
  }
  if (/[\u4e00-\u9fa5]/.test(key)) {
    return '授权码格式错误，请检查输入'
  }
  if (key.length < 10) {
    return '授权码长度不足'
  }
  return null
}

export function LicenseDialog({ open, onOpenChange, onSuccess }: LicenseDialogProps) {
  const [licenseKey, setLicenseKey] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<LicenseStatus | null>(null)

  const handleActivate = async () => {
    // 前端验证
    const validationError = validateLicenseKey(licenseKey)
    if (validationError) {
      setError(validationError)
      return
    }

    setIsLoading(true)
    setError(null)
    setResult(null)

    try {
      const response = await licenseApi.activate(licenseKey)
      console.log('激活响应:', response)

      // 直接检查 response 对象的结构
      if (response.data && 'valid' in response.data && response.data.valid) {
        setResult(response.data)
        // 传递完整的激活数据给 onSuccess
        setTimeout(() => {
          onSuccess({
            license_key: licenseKey,
            license_type: response.data?.license_type || 'year',
            expires_at: response.data?.expires_at,
            activated_at: response.data?.activated_at
          })
        }, 1500)
      } else if (response.error) {
        setError('您输入的授权码无效，请检查后重新输入')
      } else {
        setError('激活失败，请稍后重试')
      }
    } catch (err) {
      // 网络错误不显示具体信息
      setError('网络异常，请检查网络连接后重试')
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }

  const handleClose = () => {
    setLicenseKey('')
    setError(null)
    setResult(null)
    onOpenChange(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isLoading) {
      handleActivate()
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md max-w-[90vw]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Key className="w-5 h-5" />
            激活授权
          </DialogTitle>
          <DialogDescription>
            请输入您购买的授权码来激活软件
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* 授权码输入 */}
          <div className="space-y-2">
            <Label htmlFor="license-key">授权码</Label>
            <Input
              id="license-key"
              placeholder="GLY-XXXX-XXXX-XXXX-XXXX"
              value={licenseKey}
              onChange={(e) => setLicenseKey(e.target.value.toUpperCase())}
              onKeyDown={handleKeyDown}
              disabled={isLoading}
              className="font-mono text-base w-full max-w-full"
              style={{ wordBreak: 'break-all' }}
            />
          </div>

          {/* 错误提示 */}
          {error && (
            <div className="flex items-center gap-2 text-red-600 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* 成功提示 */}
          {result?.valid && (
            <div className="flex items-center gap-2 text-green-600 text-sm">
              <CheckCircle className="w-4 h-4 shrink-0" />
              <span>激活成功！授权类型：{result.license_type}</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isLoading}>
            取消
          </Button>
          <Button onClick={handleActivate} disabled={isLoading || result?.valid}>
            {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            激活
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
