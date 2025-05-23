import type * as lsp from "vscode-languageserver-protocol"
import {EditorView, Command, KeyBinding, showDialog, getDialog} from "@codemirror/view"
import {LSPPlugin} from "./plugin"

function getRename(plugin: LSPPlugin, pos: number, newName: string) {
  plugin.sync()
  return plugin.client.mappedRequest<lsp.RenameParams, lsp.WorkspaceEdit | null>("textDocument/rename", {
    newName,
    position: plugin.toPos(pos),
    textDocument: {uri: plugin.uri},
  })
}

/// This command will, if the cursor is over a word, prompt the user
/// for a new name for that symbol, and ask the language server to
/// perform a rename of that symbol.
///
/// Note that this may affect files other than the one loaded into
/// this view. See the
/// [`handleChangeInFile`](#lsp-client.LSPClientConfig.handleChangeInFile)
/// option.
export const renameSymbol: Command = view => {
  let wordRange = view.state.wordAt(view.state.selection.main.head)
  let plugin = LSPPlugin.get(view)
  if (!wordRange || !plugin || plugin.client.hasCapability("renameProvider") === false) return false
  let word = view.state.sliceDoc(wordRange.from, wordRange.to)
  let panel = getDialog(view, "cm-lsp-rename-panel")
  if (panel) {
    let input = panel.dom.querySelector("[name=name]") as HTMLInputElement
    input.value = word
    input.select()
  } else {
    let {close, result} = showDialog(view, {
      label: view.state.phrase("New name"),
      input: {name: "name", value: word},
      focus: true,
      submitLabel: view.state.phrase("rename"),
      class: "cm-lsp-rename-panel",
    })
    result.then(form => {
      view.dispatch({effects: close})
      if (form) doRename(view, (form.elements.namedItem("name") as HTMLInputElement).value)
    })
  }
  return true
}

function doRename(view: EditorView, newName: string) {
  const plugin = LSPPlugin.get(view)
  let word = view.state.wordAt(view.state.selection.main.head)
  if (!plugin || !word) return false

  getRename(plugin, word.from, newName).then(({response, mapping}) => {
    if (!response) return
    let handler = plugin.client.config.handleChangeInFile
    uris: for (let uri in response.changes) {
      let lspChanges = response.changes[uri]
      if (!lspChanges.length) continue
      let target = view
      if (uri != plugin.uri) { // Not the file in this editor
        if (handler && handler(uri, lspChanges)) continue
        let file = plugin.client.getOpenFile(uri)
        if (!file) continue
        target = file.mainEditor(plugin.view)
      }
      target.dispatch({
        changes: lspChanges.map(change => ({
          from: mapping.mapPosition(uri, change.range.start),
          to: mapping.mapPosition(uri, change.range.end),
          insert: change.newText
        })),
        userEvent: "rename"
      })
    }
  }, err => {
    plugin.reportError("Rename request failed", err)
  })
}

/// A keymap that binds F2 to [`renameSymbol`](#lsp-server.renameSymbol).
export const renameKeymap: readonly KeyBinding[] = [
  {key: "F2", run: renameSymbol, preventDefault: true}
]
