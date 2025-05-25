import type * as lsp from "vscode-languageserver-protocol"
import {Command, KeyBinding} from "@codemirror/view"
import {LSPPlugin} from "./plugin"

function getReferences(plugin: LSPPlugin, pos: number) {
  return plugin.client.mappedRequest<lsp.ReferenceParams, lsp.Location[] | null>("textDocument/references", {
    textDocument: {uri: plugin.uri},
    position: plugin.toPosition(pos),
    context: {includeDeclaration: true}
  })
}



export const findReferences: Command = view => {
  let plugin = LSPPlugin.get(view)
  if (!plugin || !plugin.client.hasCapability("referencesProvider") === false) return false
  getReferences(plugin, view.state.selection.main.head).then(({mapping, response}) => {
    if (!response) return
    
  }, err => plugin.reportError("Finding references failed", err))
  return true
}

/// Binds Shift-F12 to [`findReferences`](#lsp-client.findReferences).
export const findReferencesKeymap: readonly KeyBinding[] = [
  {key: "Shift-F12", run: findReferences, preventDefault: true},
]
