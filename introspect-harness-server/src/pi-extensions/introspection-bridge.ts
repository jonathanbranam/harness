import type { EventEmitter } from 'node:events'
import type { ExtensionAPI, ExtensionContext, ExtensionFactory } from '@earendil-works/pi-coding-agent'

export function introspectionBridge(events: EventEmitter): ExtensionFactory {
  return function introspectionBridgeExtension(pi: ExtensionAPI) {
    function emit(event: Record<string, unknown>) {
      events.emit('event', event)
    }

    pi.on('session_start', (event) => emit({ ...event }))
    pi.on('agent_start', (event) => emit({ ...event }))
    pi.on('turn_start', (event) => emit({ ...event }))
    pi.on('turn_end', (event) => emit({ ...event }))
    pi.on('agent_end', (event) => emit({ ...event }))
    pi.on('agent_settled', (event) => emit({ ...event }))

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
