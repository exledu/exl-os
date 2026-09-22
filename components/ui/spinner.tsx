import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('h-4 w-4 animate-spin', className)} />
}

export function PanelLoading({ label = 'Loading…', className }: { label?: string; className?: string }) {
  return (
    <div className={cn('flex h-full flex-col items-center justify-center gap-2 text-sm text-gray-400', className)}>
      <Spinner className="h-5 w-5" />
      {label}
    </div>
  )
}

export function InlineLoading({ label = 'Loading…', className }: { label?: string; className?: string }) {
  return (
    <div className={cn('flex items-center justify-center gap-1.5 py-6 text-xs text-gray-400', className)}>
      <Spinner className="h-3.5 w-3.5" />
      {label}
    </div>
  )
}
