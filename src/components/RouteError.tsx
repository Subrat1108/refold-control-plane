import { useRouteError, isRouteErrorResponse, useNavigate } from 'react-router-dom'

// Route-level error boundary (errorElement): renders a friendly page instead of
// a dev stack trace when a route or its descendants throw during render.
export function RouteError() {
  const error = useRouteError()
  const navigate = useNavigate()

  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : 'An unexpected error occurred.'

  return (
    <div className="min-h-screen bg-[#F8F9FC] flex flex-col items-center justify-center px-4 text-center">
      <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mb-4">
        <svg className="w-7 h-7 text-destructive" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
      </div>
      <h1 className="text-xl font-semibold text-foreground mb-2">Something went wrong</h1>
      <p className="text-sm text-muted-foreground mb-1 max-w-md">
        The page hit an unexpected error and couldn't be displayed.
      </p>
      <p className="text-xs text-muted-foreground/80 font-mono mb-6 max-w-md break-words">{message}</p>
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/overview')}
          className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
        >
          Back to overview
        </button>
        <button
          onClick={() => window.location.reload()}
          className="rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-gray-50 transition-colors"
        >
          Reload
        </button>
      </div>
    </div>
  )
}
