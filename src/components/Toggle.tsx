import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'

interface ToggleProps {
  id: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  label?: string
  disabled?: boolean
}

export function Toggle({ id, checked, onCheckedChange, label, disabled }: ToggleProps) {
  return (
    <div className="flex items-center gap-2">
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
      {label && <Label htmlFor={id} className="text-sm cursor-pointer">{label}</Label>}
    </div>
  )
}
