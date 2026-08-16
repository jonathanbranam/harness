import type { EventEmitter } from 'node:events'
import type { ExtensionAPI, ExtensionContext, ExtensionFactory } from '@earendil-works/pi-coding-agent'
import type { RecordingWriter } from '../recording-writer'
import type { RecordingEvent } from '../recording-types'

/**
 * `sandboxPath` is the sandbox directory this session's agent runs
 * against — needed so the `agent_settled` hook can hand it to
 * `recordingWriter.snapshot()`. `recordingWriter` is always passed
 * (never a no-op stub): its own `isRecording()` gate means calls here are
 * cheap no-ops while recording is off, so starting/stopping recording never
 * requires reloading this extension.
 */
export function introspectionBridge(events: EventEmitter, recordingWriter: RecordingWriter, sandboxPath: string): ExtensionFactory {
  return function introspectionBridgeExtension(pi: ExtensionAPI) {
    function emit(event: Record<string, unknown>) {
      events.emit('event', event)
      recordingWriter.appendEvent(event as RecordingEvent)
    }

    pi.on('session_start', (event) => emit({ ...event }))
    pi.on('agent_start', (event) => emit({ ...event }))
    pi.on('turn_start', (event) => emit({ ...event }))
    pi.on('turn_end', (event) => emit({ ...event }))
    pi.on('agent_end', (event) => emit({ ...event }))
    pi.on('agent_settled', async (event) => {
      emit({ ...event })
      if (recordingWriter.isRecording()) {
        await recordingWriter.snapshot(sandboxPath)
      }
    })

    pi.on('message_start', (event) => emit({ ...event }))
    pi.on('message_update', (event, ctx: ExtensionContext) => {
      emit({ ...event })
      const usage = ctx.getContextUsage()
      if (usage) {
        emit({
          type: 'context_usage',
          tokens: usage.tokens,
          contextWindow: usage.contextWindow,
          percent: usage.percent,
        })
      }
    })
    pi.on('message_end', (event) => emit({ ...event }))

    pi.on('tool_execution_start', (event) => emit({ ...event }))
    pi.on('tool_execution_end', (event) => emit({ ...event }))

    pi.on('before_agent_start', (event) => {
      emit({
        type: 'foundation_update',
        systemPrompt: event.systemPrompt,
        skills: event.systemPromptOptions.skills ?? [],
        guides: [],
        sensors: [],
      })
    })

    pi.on('resources_discover', (event) => {
      // Resources are discovered before each agent start; the foundation
      // payload is refreshed by before_agent_start with the loaded skills.
      return { skillPaths: [] }
    })
  }
}
