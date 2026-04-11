import { useAuthStore } from '@/stores'
import { Card, CardContent } from '@/components/ui/card'
import { ShieldX } from 'lucide-react'

export function AdminRoute({ children }: { children: React.ReactNode }) {
  const isAdmin = useAuthStore((s) => s.isAdmin)

  if (!isAdmin) {
    return (
      <Card className="border-0 shadow-sm">
        <CardContent className="py-16">
          <div className="text-center">
            <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
              <ShieldX className="w-8 h-8 text-red-500" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-1">访问被拒绝</h3>
            <p className="text-muted-foreground">您没有管理员权限，无法访问此页面</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return <>{children}</>
}
