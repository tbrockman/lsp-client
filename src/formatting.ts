import {Command, keymap} from "@codemirror/view"
import {ChangeSpec} from "@codemirror/state"
import {indentUnit, getIndentUnit} from "@codemirror/language"
import {lspPlugin} from "./plugin.js"
import {fromPos} from "./pos.js"

export const formatDocument: Command = view => {
  const plugin = view.plugin(lspPlugin)
  if (!plugin) return false
  let startDoc = view.state.doc
  plugin.client.formatting(view, {
    tabSize: getIndentUnit(view.state),
    insertSpaces: view.state.facet(indentUnit).indexOf("\t") < 0,
  }).then(({response, mapping}) => {
    if (!response) return
    let changed = mapping.getMapping(plugin.uri)
    let changes: ChangeSpec[] = []
    for (let change of response) {
      let from = fromPos(startDoc, change.range.start), to = fromPos(startDoc, change.range.end)
      if (changed) {
        // Don't try to apply the changes if code inside of any of them was touched
        if (changed.touchesRange(from, to)) return
        from = changed.mapPos(from, 1)
        to = changed.mapPos(to, -1)
      }
      changes.push({from, to, insert: change.newText})
    }
    view.dispatch({
      changes,
      userEvent: "format"
    })
  })
  return true
}

export const formatKeymap = keymap.of([
  {key: "Shift-Alt-f", run: formatDocument, preventDefault: true}
])
