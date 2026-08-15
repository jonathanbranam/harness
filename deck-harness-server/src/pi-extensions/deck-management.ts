// Registers the tools that let pi create/list/select/delete decks and
// add/remove/select slides within the active deck, per deck-management's
// spec. Mirrors presentation-bridge.ts: tools call editorStore directly,
// no self-HTTP.

import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'
import { Type } from 'typebox'
import { editorStore } from '../editor-state'

export function deckManagement(pi: ExtensionAPI) {
  pi.registerTool({
    name: 'deck_create',
    label: 'Create Deck',
    description:
      'Create a new presentation deck with the given name. The new deck starts with exactly one blank slide (no objects) and becomes the active deck, with that slide as the active slide.',
    promptSnippet: 'Create a new deck and make it active',
    parameters: Type.Object({
      name: Type.String({ description: 'Display name for the new deck.' }),
    }),
    execute: async (_id, params) => {
      const result = editorStore.createDeck(params.name)
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }], details: result }
    },
  })

  pi.registerTool({
    name: 'deck_list',
    label: 'List Decks',
    description: 'List every deck (id, name, and slide count).',
    promptSnippet: 'List all decks',
    parameters: Type.Object({}),
    execute: async () => {
      const decks = editorStore.listDecks()
      return { content: [{ type: 'text' as const, text: JSON.stringify(decks, null, 2) }], details: decks }
    },
  })

  pi.registerTool({
    name: 'deck_select',
    label: 'Select Deck',
    description:
      "Make the given deck the active deck, given its id. Restores that deck's own last-active slide (its first slide the first time it's activated).",
    promptSnippet: 'Switch the active deck',
    parameters: Type.Object({
      deckId: Type.String(),
    }),
    execute: async (_id, params) => {
      const result = editorStore.selectDeck(params.deckId)
      return {
        content: [{ type: 'text' as const, text: result.ok ? 'OK' : `Error: ${result.error}` }],
        details: result,
        isError: !result.ok,
      }
    },
  })

  pi.registerTool({
    name: 'deck_delete',
    label: 'Delete Deck',
    description:
      'Delete a deck by id, removing it and all of its slides. Rejected if it is the only remaining deck. If it was the active deck, another remaining deck becomes active.',
    promptSnippet: 'Delete a deck',
    parameters: Type.Object({
      deckId: Type.String(),
    }),
    execute: async (_id, params) => {
      const result = editorStore.deleteDeck(params.deckId)
      return {
        content: [{ type: 'text' as const, text: result.ok ? 'OK' : `Error: ${result.error}` }],
        details: result,
        isError: !result.ok,
      }
    },
  })

  pi.registerTool({
    name: 'slide_add',
    label: 'Add Slide',
    description: 'Append a new, blank (no objects) slide to the active deck, and make it the active slide.',
    promptSnippet: 'Add a blank slide to the active deck',
    parameters: Type.Object({}),
    execute: async () => {
      const result = editorStore.addSlide()
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }], details: result }
    },
  })

  pi.registerTool({
    name: 'slide_remove',
    label: 'Remove Slide',
    description:
      'Remove a slide from the active deck by id. Rejected if it is the only remaining slide in the deck. If it was the active slide, another slide in that deck becomes active.',
    promptSnippet: 'Remove a slide from the active deck',
    parameters: Type.Object({
      slideId: Type.String(),
    }),
    execute: async (_id, params) => {
      const result = editorStore.removeSlide(params.slideId)
      return {
        content: [{ type: 'text' as const, text: result.ok ? 'OK' : `Error: ${result.error}` }],
        details: result,
        isError: !result.ok,
      }
    },
  })

  pi.registerTool({
    name: 'slide_select',
    label: 'Select Slide',
    description:
      'Make the given slide the active slide, given a slide id that belongs to the active deck. Clears the current selection.',
    promptSnippet: 'Switch the active slide within the active deck',
    parameters: Type.Object({
      slideId: Type.String(),
    }),
    execute: async (_id, params) => {
      const result = editorStore.selectSlide(params.slideId)
      return {
        content: [{ type: 'text' as const, text: result.ok ? 'OK' : `Error: ${result.error}` }],
        details: result,
        isError: !result.ok,
      }
    },
  })
}
