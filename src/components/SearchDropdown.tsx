import { useState, useRef, useEffect } from 'react'
import { Search } from 'lucide-react'

interface SearchDropdownProps {
  placeholder?: string
  onSearch?: (query: string) => void
}

export function SearchDropdown({ placeholder = 'Search...', onSearch }: SearchDropdownProps) {
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    onSearch?.(value)
  }, [value, onSearch])

  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className="pl-9 pr-4 py-2 text-sm bg-gray-50 border border-border rounded-lg w-64 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary placeholder:text-muted-foreground"
      />
    </div>
  )
}
