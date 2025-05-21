import {ChangeSpec, StateField, StateEffect} from "@codemirror/state"
import {EditorView, Command, keymap, Panel, getPanel, showPanel} from "@codemirror/view"
import elt from "crelt"
import {lspPlugin} from "./plugin.js"
import {fromPos} from "./pos.js"

export const renameSymbol: Command = view => {
  let word = view.state.wordAt(view.state.selection.main.head)
  if (!word || !view.plugin(lspPlugin)) return false
  let panel = getPanel(view, createPromptDialog)
  if (!panel) {
    let effects: StateEffect<unknown>[] = [dialogEffect.of(view.state.sliceDoc(word.from, word.to))]
    if (view.state.field(dialogField, false) == null)
      effects.push(StateEffect.appendConfig.of(dialogField))
    view.dispatch({effects})
    panel = getPanel(view, createPromptDialog)
  }
  if (panel) panel.dom.querySelector("input")!.select()
  return true
}

function runRename(view: EditorView, newName: string) {
  const plugin = view.plugin(lspPlugin)
  let word = view.state.wordAt(view.state.selection.main.head)
  if (!plugin || !word) return false

  let startDoc = view.state.doc
  plugin.client.rename(view, word.from, newName).then(({response, mapping}) => {
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
  })
}

// FIXME create a utility for this in @codemirror/view
function createPromptDialog(view: EditorView): Panel {
  let input = elt("input", {class: "cm-textfield", name: "name", value: view.state.field(dialogField)}) as HTMLInputElement
  let dom = elt("form", {
    class: "cm-rename-prompt",
    onkeydown: (event: KeyboardEvent) => {
      if (event.keyCode == 27) { // Escape
        event.preventDefault()
        done()
      } else if (event.keyCode == 13) { // Enter
        event.preventDefault()
        done(input.value)
      }
    },
    onsubmit: (event: Event) => {
      event.preventDefault()
      done(input.value)
    }
  }, elt("label", view.state.phrase("New name"), ": ", input), " ",
     elt("button", {class: "cm-button", type: "submit"}, view.state.phrase("rename")),
     elt("button", {
       name: "close",
       onclick: () => done(),
       "aria-label": view.state.phrase("close"),
       type: "button"
     }, ["×"]))

  function done(value?: string) {
    view.dispatch({effects: dialogEffect.of(null)})
    view.focus()
    if (value) runRename(view, value)
  }
  return {dom}
}

const dialogEffect = StateEffect.define<string | null>()

const dialogField = StateField.define<string | null>({
  create() { return null },
  update(value, tr) {
    for (let e of tr.effects) if (e.is(dialogEffect)) value = e.value
    return value
  },
  provide: f => showPanel.from(f, val => val != null ? createPromptDialog : null)
})

export const renameKeymap = keymap.of([
  {key: "F2", run: renameSymbol, preventDefault: true}
])
