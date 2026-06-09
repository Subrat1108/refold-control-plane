import { ReactNode } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'

interface SlideOverProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  width?: number
}

export function SlideOver({ open, onClose, title, children, width = 400 }: SlideOverProps) {
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" style={{ width, maxWidth: '100vw' }} className="overflow-y-auto">
        <SheetHeader className="mb-6">
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>
        {children}
      </SheetContent>
    </Sheet>
  )
}
