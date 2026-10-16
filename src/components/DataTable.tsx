import { Fragment, ReactNode, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { EmptyState } from './EmptyState'

export interface Column<T> {
  key: string
  header: string
  render: (row: T) => ReactNode
  width?: string
}

interface DataTableProps<T> {
  columns: Column<T>[]
  data: T[]
  rowKey: (row: T) => string
  emptyTitle?: string
  emptyDescription?: string
  // Optional row expansion. Returning null for a row means it has nothing
  // to expand and gets no chevron — so a cloud account (which by definition
  // has no tenants) looks the same as it always did, while an on-prem or
  // dedicated-cluster account can open to show what sits under it. Keeping
  // this in the one table component avoids a second design for "accounts
  // with children", which is the trap the Approvals screen fell into.
  renderExpanded?: (row: T) => ReactNode
}

export function DataTable<T>({ columns, data, rowKey, emptyTitle = 'No results', emptyDescription, renderExpanded }: DataTableProps<T>) {
  const [open, setOpen] = useState<Set<string>>(new Set())
  const toggle = (key: string) => setOpen((prev) => {
    const next = new Set(prev)
    if (next.has(key)) next.delete(key); else next.add(key)
    return next
  })

  if (data.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            {renderExpanded && <th className="w-8" />}
            {columns.map((col) => (
              <th key={col.key} className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide" style={col.width ? { width: col.width } : {}}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row) => {
            const key = rowKey(row)
            const expanded = renderExpanded?.(row)
            const isOpen = open.has(key)
            return (
              <Fragment key={key}>
                <tr className="h-[52px] border-b border-border last:border-0 hover:bg-muted/40 transition-colors">
                  {renderExpanded && (
                    <td className="pl-4">
                      {expanded ? (
                        <button
                          onClick={() => toggle(key)}
                          aria-expanded={isOpen}
                          aria-label={isOpen ? 'Collapse' : 'Expand'}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        </button>
                      ) : null}
                    </td>
                  )}
                  {columns.map((col) => (
                    <td key={col.key} className="px-4">{col.render(row)}</td>
                  ))}
                </tr>
                {expanded && isOpen && (
                  <tr className="border-b border-border last:border-0 bg-muted/20">
                    <td colSpan={columns.length + 1} className="px-4 py-3">{expanded}</td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
