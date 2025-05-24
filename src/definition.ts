import type * as lsp from "vscode-languageserver-protocol"
import {EditorView, Command, KeyBinding} from "@codemirror/view"
import {LSPPlugin} from "./plugin"

function getDefinition(plugin: LSPPlugin, pos: number) {
  return plugin.client.mappedRequest<lsp.DefinitionParams, lsp.Location | lsp.Location[] | null>("textDocument/definition", {
    textDocument: {uri: plugin.uri},
    position: plugin.toPosition(pos)
  })
}

function getDeclaration(plugin: LSPPlugin, pos: number) {
  return plugin.client.mappedRequest<lsp.DeclarationParams, lsp.Location | lsp.Location[] | null>("textDocument/declaration", {
    textDocument: {uri: plugin.uri},
    position: plugin.toPosition(pos)
  })
}

function getTypeDefinition(plugin: LSPPlugin, pos: number) {
  return plugin.client.mappedRequest<lsp.TypeDefinitionParams, lsp.Location | lsp.Location[] | null>("textDocument/typeDefinition", {
    textDocument: {uri: plugin.uri},
    position: plugin.toPosition(pos)
  })
}

function getImplementation(plugin: LSPPlugin, pos: number) {
  return plugin.client.mappedRequest<lsp.ImplementationParams, lsp.Location | lsp.Location[] | null>("textDocument/implementation", {
    textDocument: {uri: plugin.uri},
    position: plugin.toPosition(pos)
  })
}

function jumpToOrigin(view: EditorView, type: {get: typeof getDefinition, capability: keyof lsp.ServerCapabilities}): boolean {
  let plugin = LSPPlugin.get(view)
  if (!plugin || !plugin.client.hasCapability(type.capability)) return false
  type.get(plugin, view.state.selection.main.head).then(({mapping, response}) => {
    if (!response) return
    let loc = Array.isArray(response) ? response[0] : response
    let target = loc.uri == plugin.uri ? view : plugin.client.config.displayFile?.(loc.uri)
    if (!target) return
    let pos = mapping.getMapping(loc.uri) ? mapping.mapPosition(loc.uri, loc.range.start)
      : plugin.fromPosition(loc.range.start, target.state.doc)
    target.dispatch({selection: {anchor: pos}, scrollIntoView: true, userEvent: "select.definition"})
  }, error => plugin.reportError("Find definition failed", error))
  return true
}

/// Jump to the definition of the symbol at the cursor. To support
/// cross-file jumps, you'll need to implement
/// [`LSPClientConfig.displayFile`](#lsp-client.LSPClientConfig.displayFile).
export const jumpToDefinition: Command = view => jumpToOrigin(view, {
  get: getDefinition,
  capability: "definitionProvider"
})

/// Jump to the declaration of the symbol at the cursor.
export const jumpToDeclaration: Command = view => jumpToOrigin(view, {
  get: getDeclaration,
  capability: "declarationProvider"
})

/// Jump to the type definition of the symbol at the cursor.
export const jumpToTypeDefinition: Command = view => jumpToOrigin(view, {
  get: getTypeDefinition,
  capability: "typeDefinitionProvider"
})

/// Jump to the implementation of the symbol at the cursor.
export const jumpToImplementation: Command = view => jumpToOrigin(view, {
  get: getImplementation,
  capability: "implementationProvider"
})

/// Binds F12 to [`jumpToDefinition`](#lsp-client.jumpToDefinition).
export const jumpToDefinitionKeymap: readonly KeyBinding[] = [
  {key: "F12", run: jumpToDefinition, preventDefault: true},
]
