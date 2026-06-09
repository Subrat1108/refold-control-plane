import { useParams } from 'react-router-dom'

export function NamespaceDetailPage() {
  const { orgId, namespaceId } = useParams()
  return (
    <div className="text-sm text-muted-foreground">
      Namespace <code className="font-mono text-xs bg-gray-100 px-1 rounded">{namespaceId}</code> (org <code className="font-mono text-xs bg-gray-100 px-1 rounded">{orgId}</code>) — coming in prompt 5.7
    </div>
  )
}
