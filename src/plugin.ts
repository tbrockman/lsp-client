import type * as lsp from "vscode-languageserver-protocol"
import {EditorView, ViewPlugin, ViewUpdate} from "@codemirror/view"
import {ChangeSet, EditorState, Text} from "@codemirror/state"
import {language} from "@codemirror/language"
import {type LSPClient} from "./client"
import {docToHTML, withContext} from "./text"
import {toPos, fromPos} from "./pos"

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

export class LSPPlugin {
  client: LSPClient
  uri: string
  /// @internal
  fileState: FileState

  constructor(readonly view: EditorView, {client, uri}: {client: LSPClient, uri: string}) {
    this.client = client
    this.uri = uri
    this.fileState = new FileState(client.registerUser(uri, languageID(view.state), view),
                                   ChangeSet.empty(view.state.doc.length))
  }

  sync() {
    this.client.sync(this.view)
  }

  /// Render a doc string from the server to HTML.
  docToHTML(value: string | lsp.MarkupContent, defaultKind: lsp.MarkupKind = "plaintext") {
    let html = withContext(this.view, this.client.config.highlightLanguage, () => docToHTML(value, defaultKind))
    return this.client.config.sanitizeHTML ? this.client.config.sanitizeHTML(html) : html
  }

  /// Convert a CodeMirror document offset into an LSP `{line,
  /// character}` object. Defaults to using the view's current
  /// document, but can be given another one.
  toPos(pos: number, doc: Text = this.view.state.doc) {
    return toPos(doc, pos)
  }

  /// Convert an LSP `{line, character}` object to a CodeMirror
  /// document offset.
  fromPos(pos: lsp.Position, doc: Text = this.view.state.doc) {
    return fromPos(doc, pos)
  }

  update(update: ViewUpdate) {
    if (!update.changes.empty)
      this.fileState = new FileState(this.fileState.syncedVersion,
                                     this.fileState.changes.compose(update.changes))
  }

  destroy() {
    this.client.unregisterUser(this.uri, this.view)
  }

  static get(view: EditorView) {
    return view.plugin(lspPlugin)
  }
}

export const lspPlugin = ViewPlugin.fromClass(LSPPlugin)
