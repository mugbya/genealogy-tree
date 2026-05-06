import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface UpdateInfo {
  version: string
  notes?: string
  pub_date?: string
}

interface UpdateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  updateInfo: UpdateInfo | null
  onUpdate: () => void
  onLater: () => void
  downloading?: boolean
  downloadProgress?: number
  needsRestart?: boolean
}

export function UpdateDialog({
  open,
  onOpenChange,
  updateInfo,
  onUpdate,
  onLater,
  downloading = false,
  downloadProgress = 0,
  needsRestart = false,
}: UpdateDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{needsRestart ? '更新已下载' : '发现新版本'}</DialogTitle>
          <p className="text-sm text-muted-foreground">
            {needsRestart
              ? '请重启应用以完成更新'
              : updateInfo?.version
              ? `版本 ${updateInfo.version} 现已可用`
              : '新版本现已可用'}
          </p>
        </DialogHeader>

        <div className="py-4">
          {needsRestart ? (
            <div className="text-sm text-muted-foreground">
              <p>更新已下载完成，请在方便时重启应用以使用新版本。</p>
            </div>
          ) : (
            updateInfo?.notes && (
              <div className="text-sm text-muted-foreground">
                <p className="font-medium mb-2">更新内容：</p>
                <p className="whitespace-pre-wrap">{updateInfo.notes}</p>
              </div>
            )
          )}

          {downloading && (
            <div className="mt-4">
              <div className="flex justify-between text-sm mb-2">
                <span>正在下载更新...</span>
                <span>{Math.round(downloadProgress)}%</span>
              </div>
              <div className="w-full bg-secondary rounded-full h-2">
                <div
                  className="bg-primary h-2 rounded-full transition-all duration-300"
                  style={{ width: `${downloadProgress}%` }}
                />
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          {needsRestart ? (
            <Button onClick={onLater}>知道了</Button>
          ) : (
            <>
              <Button variant="outline" onClick={onLater} disabled={downloading}>
                稍后更新
              </Button>
              <Button onClick={onUpdate} disabled={downloading}>
                {downloading ? '下载中...' : '立即更新'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
