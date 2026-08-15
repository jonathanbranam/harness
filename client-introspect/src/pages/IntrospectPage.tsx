import { useAuth } from '../hooks/useAuth'
import { useIntrospectSocket } from '../hooks/useIntrospectSocket'
import { ChatPanel } from '../components/ChatPanel'
import { ApparatusView } from '../components/ApparatusView'

export function IntrospectPage() {
  const { logout } = useAuth()
  const { connected, blocks, foundation, usage, sendPrompt } = useIntrospectSocket()

  return (
    <div className="h-screen flex flex-col bg-gray-950 text-white">
      <header className="flex items-center justify-between px-4 py-2 border-b border-gray-800">
        <span className="font-semibold">Introspect Harness</span>
        <button type="button" onClick={() => void logout()} className="text-sm text-gray-400 hover:text-white">
          Sign out
        </button>
      </header>

      <div className="flex-1 grid grid-cols-[380px_1fr] min-h-0">
        <div className="border-r border-gray-800 min-h-0">
          <ChatPanel blocks={blocks} connected={connected} onSend={sendPrompt} />
        </div>
        <ApparatusView blocks={blocks} foundation={foundation} usage={usage} />
      </div>
    </div>
  )
}
