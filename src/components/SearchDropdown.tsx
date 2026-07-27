import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Building2, Layers, Plug } from 'lucide-react'
import { useSearch } from '@/hooks'
import { cn } from '@/lib/utils'
import type { SearchResultItem, SearchResultType } from '@/types'

interface SearchDropdownProps {
  placeholder?: string
  // When provided, the input acts as a plain controlled filter (used by the
  // customer list pages). Without it, it is the global-navigation search.
  onSearch?: (query: string) => void
}

const TYPE_ICON: Record<SearchResultType, typeof Building2> = {
  org: Building2,
  namespace: Layers,
  connector: Plug,
}

export function SearchDropdown({ placeholder = 'Search...', onSearch }: SearchDropdownProps) {
  if (onSearch) return <FilterInput placeholder={placeholder} onSearch={onSearch} />
  return <GlobalSearch placeholder={placeholder} />
}

function FilterInput({ placeholder, onSearch }: { placeholder: string; onSearch: (q: string) => void }) {
  const [value, setValue] = useState('')
  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
      <input
        type="text"
        value={value}
        onChange={(e) => { setValue(e.target.value); onSearch(e.target.value) }}
        placeholder={placeholder}
        className="pl-9 pr-4 py-2 text-sm bg-gray-50 border border-border rounded-lg w-64 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary placeholder:text-muted-foreground"
      />
    </div>
  )
}

function GlobalSearch({ placeholder }: { placeholder: string }) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)

  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Debounce the query fed to the search so typing stays responsive.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 150)
    return () => clearTimeout(t)
  }, [query])

  const { data } = useSearch(debounced)

  const flat = useMemo<SearchResultItem[]>(
    () => (data ? [...data.organizations, ...data.namespaces, ...data.connectors] : []),
    [data]
  )

  // Reset focus to the first result whenever the result set changes.
  useEffect(() => setActiveIndex(0), [debounced])

  // Close on outside click.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const hasQuery = query.trim().length > 0
  const showDropdown = open && hasQuery

  function select(item: SearchResultItem) {
    navigate(item.href)
    setQuery('')
    setDebounced('')
    setOpen(false)
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      setOpen(false)
      inputRef.current?.focus()
      return
    }
    if (!showDropdown || flat.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => (i + 1) % flat.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => (i - 1 + flat.length) % flat.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const item = flat[activeIndex]
      if (item) select(item)
    }
  }


  return (
    <div ref={containerRef} className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={showDropdown}
        aria-controls="global-search-listbox"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
        onFocus={() => hasQuery && setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className="pl-9 pr-4 py-2 text-sm bg-gray-50 border border-border rounded-lg w-64 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary placeholder:text-muted-foreground"
      />

      {showDropdown && (
        <div
          id="global-search-listbox"
          role="listbox"
          className="absolute right-0 top-full mt-2 w-[24rem] max-h-[26rem] overflow-y-auto bg-white rounded-lg shadow-lg border border-border py-2 z-50"
        >
          {!data ? (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">Searching…</div>
          ) : flat.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">No results</div>
          ) : (
            <>
              <ResultGroup title="Organizations" items={data.organizations} startIndex={0} activeIndex={activeIndex} onHover={setActiveIndex} onSelect={select} />
              <ResultGroup title="Namespaces" items={data.namespaces} startIndex={data.organizations.length} activeIndex={activeIndex} onHover={setActiveIndex} onSelect={select} />
              <ResultGroup title="Connectors" items={data.connectors} startIndex={data.organizations.length + data.namespaces.length} activeIndex={activeIndex} onHover={setActiveIndex} onSelect={select} />
            </>
          )}
        </div>
      )}
    </div>
  )
}

function ResultGroup({
  title,
  items,
  startIndex,
  activeIndex,
  onHover,
  onSelect,
}: {
  title: string
  items: SearchResultItem[]
  startIndex: number
  activeIndex: number
  onHover: (i: number) => void
  onSelect: (item: SearchResultItem) => void
}) {
  if (items.length === 0) return null
  return (
    <div className="py-1">
      <div className="px-4 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</div>
      {items.map((item, i) => {
        const index = startIndex + i
        const active = index === activeIndex
        const Icon = TYPE_ICON[item.type]
        return (
          <button
            key={item.id}
            role="option"
            aria-selected={active}
            onMouseEnter={() => onHover(index)}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onSelect(item)}
            className={cn(
              'w-full flex items-center gap-3 px-4 py-2 text-left transition-colors',
              active ? 'bg-primary/10' : 'hover:bg-gray-50'
            )}
          >
            <Icon className={cn('w-4 h-4 flex-shrink-0', active ? 'text-primary' : 'text-muted-foreground')} />
            <div className="min-w-0">
              <div className="text-sm font-medium text-foreground truncate">{item.name}</div>
              <div className="text-xs text-muted-foreground truncate">{item.breadcrumb}</div>
            </div>
          </button>
        )
      })}
    </div>
  )
}
