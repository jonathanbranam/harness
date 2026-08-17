export interface ChatMessageEntry {
  kind: 'message'
  id: string
  role: 'user' | 'assistant'
  text: string
  streaming?: boolean
}

export interface ToolCallEntry {
  kind: 'tool'
  id: string
  toolCallId: string
  toolName: string
  status: 'running' | 'done' | 'error'
  resultSummary?: string
}

export type TranscriptEntry = ChatMessageEntry | ToolCallEntry
