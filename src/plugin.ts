import {EditorView, ViewPlugin, ViewUpdate} from "@codemirror/view"
import {ChangeSet, EditorState} from "@codemirror/state"
import {language} from "@codemirror/language"
import {type LSPClient} from "./client.js"

function languageID(state: EditorState) {
  let lang = state.facet(language)
  return lang ? lang.name : ""
}

export class FileState {
  constructor(
    readonly syncedVersion: number,
    readonly changes: ChangeSet
  ) {}
}

export const lspPlugin = ViewPlugin.fromClass(class {
  client: LSPClient
  uri: string
  fileState: FileState

  constructor(readonly view: EditorView, {client, uri}: {client: LSPClient, uri: string}) {
    this.client = client
    this.uri = uri
    this.fileState = new FileState(client.registerUser(uri, languageID(view.state), view),
                                   ChangeSet.empty(view.state.doc.length))
  }

  update(update: ViewUpdate) {
    if (!update.changes.empty)
      this.fileState = new FileState(this.fileState.syncedVersion,
                                     this.fileState.changes.compose(update.changes))
  }

  destroy() {
    this.client.unregisterUser(this.uri, this.view)
  }
}, {
})
