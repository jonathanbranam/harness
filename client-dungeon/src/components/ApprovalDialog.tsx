import type { ApprovalRequest } from '../hooks/useDungeonSocket'

export function ApprovalDialog({ request, onRespond }: { request: ApprovalRequest; onRespond: (approved: boolean) => void }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-white border border-gray-300 dark:bg-gray-900 dark:border-gray-700 rounded-lg p-5 w-full max-w-md space-y-3 text-gray-900 dark:text-white">
        <h2 className="font-semibold">Approve tool call?</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          pi wants to run <span className="font-mono text-gray-700 dark:text-gray-200">{request.toolName}</span>:
        </p>
        <pre className="text-xs bg-gray-100 dark:bg-gray-800 rounded-md p-2 overflow-x-auto max-h-48">{JSON.stringify(request.input, null, 2)}</pre>
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={() => onRespond(false)}
            className="px-3 py-1.5 rounded-md text-sm bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600"
          >
            Deny
          </button>
          <button
            type="button"
            onClick={() => onRespond(true)}
            className="px-3 py-1.5 rounded-md text-sm bg-indigo-600 hover:bg-indigo-500"
          >
            Approve
          </button>
        </div>
      </div>
    </div>
  )
}
