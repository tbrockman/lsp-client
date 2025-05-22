import type * as lsp from "vscode-languageserver-protocol"
import {ChangeSpec} from "@codemirror/state"
import {EditorView, Command, KeyBinding, showDialog, getDialog} from "@codemirror/view"
import {LSPPlugin} from "./plugin"
import {fromPos} from "./pos"

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
  if (!wordRange || !LSPPlugin.get(view)) return false
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

  let startDoc = view.state.doc
  getRename(plugin, word.from, newName).then(({response, mapping}) => {
    if (!response) return
    let handler = plugin.client.config.handleChangeInFile
    uris: for (let uri in response.changes) {
      let lspChanges = response.changes[uri]
      if (!lspChanges.length) continue
      let target = view
      if (uri != plugin.uri) { // Not the file in this editor
        if (handler && handler(uri, lspChanges)) continue
        let open = plugin.client.mainEditor(uri)
        if (!open) continue
        target = open
      }
      let changed = mapping.getMapping(uri)
      let changes: ChangeSpec[] = []
      for (let change of lspChanges) {
        let from = fromPos(startDoc, change.range.start), to = fromPos(startDoc, change.range.end)
        if (changed) {
          // Don't try to apply the changes if code inside of any of them was touched
          if (changed.touchesRange(from, to)) continue uris
          from = changed.mapPos(from, 1)
          to = changed.mapPos(to, -1)
        }
        changes.push({from, to, insert: change.newText})
      }
      target.dispatch({
        changes,
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
