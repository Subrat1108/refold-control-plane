import { useParams } from 'react-router-dom'

export function CloudOrgDetailPage() {
  const { orgId } = useParams()
  return (
    <div className="text-sm text-muted-foreground">
      Cloud org detail for <code className="font-mono text-xs bg-gray-100 px-1 rounded">{orgId}</code> — coming in prompt 5.5
    </div>
  )
}
