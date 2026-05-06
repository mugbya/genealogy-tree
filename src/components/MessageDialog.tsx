import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { AlertCircle, CheckCircle, Info } from 'lucide-react'
import { useState } from 'react'

interface MessageDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  type?: 'info' | 'success' | 'error'
  onOk?: () => void
}

export function MessageDialog({ open, onOpenChange, title, description, type = 'info', onOk }: MessageDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-w-[90vw]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {type === 'info' && <Info className="w-5 h-5 text-blue-600" />}
            {type === 'success' && <CheckCircle className="w-5 h-5 text-green-600" />}
            {type === 'error' && <AlertCircle className="w-5 h-5 text-red-600" />}
            {title}
          </DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <DialogFooter>
          <Button onClick={() => {
            onOk?.()
            onOpenChange(false)
          }}>确定</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// 全局提示函数
let showMessageDialog: ((options: Omit<MessageDialogProps, 'open' | 'onOpenChange'>) => void) | null = null

export function setMessageDialogHandler(handler: typeof showMessageDialog) {
  showMessageDialog = handler
}

export function useMessageDialog() {
  const [dialogState, setDialogState] = useState({
    open: false,
    title: '',
    description: '',
    type: 'info' as 'info' | 'success' | 'error',
  })

  const showMessage = (options: Omit<MessageDialogProps, 'open' | 'onOpenChange'>) => {
    setDialogState({ ...options, open: true, type: options.type || 'info' })
  }

  const MessageDialogComponent = (
    <MessageDialog
      open={dialogState.open}
      onOpenChange={(open) => setDialogState((s) => ({ ...s, open }))}
      title={dialogState.title}
      description={dialogState.description}
      type={dialogState.type}
      onOk={(dialogState as any).onOk}
    />
  )

  return { showMessage, MessageDialogComponent }
}
