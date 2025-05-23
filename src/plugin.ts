import type * as lsp from "vscode-languageserver-protocol"
import {EditorView, ViewPlugin, ViewUpdate, showDialog} from "@codemirror/view"
import {ChangeSet, Text, Extension} from "@codemirror/state"
import {language} from "@codemirror/language"
import {type LSPClient} from "./client"
import {docToHTML, withContext} from "./text"
import {toPosition, fromPosition} from "./pos"
import {lspTheme} from "./theme"

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

  constructor(readonly view: EditorView, {client, uri, languageID}: {client: LSPClient, uri: string, languageID?: string}) {
    this.client = client
    this.uri = uri
    if (!languageID) {
      let lang = view.state.facet(language)
      languageID = lang ? lang.name : ""
    }
    this.fileState = new FileState(client.registerUser(uri, languageID, view),
                                   ChangeSet.empty(view.state.doc.length))
  }

  /// Notify the server of any local changes that have been made to
  /// open documents. You'll want to call this before most types of
  /// requests, to make sure the server isn't working with outdated
  /// information.
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
    return toPosition(doc, pos)
  }

  /// Convert an LSP `{line, character}` object to a CodeMirror
  /// document offset.
  fromPos(pos: lsp.Position, doc: Text = this.view.state.doc) {
    return fromPosition(doc, pos)
  }

  reportError(message: any, err: any) {
    showDialog(this.view, {
      label: this.view.state.phrase(message) + ": " + (err.message || err),
      class: "cm-lsp-message cm-lsp-message-error",
      top: true
    })
  }

  /// @internal
  update(update: ViewUpdate) {
    if (!update.changes.empty)
      this.fileState = new FileState(this.fileState.syncedVersion,
                                     this.fileState.changes.compose(update.changes))
  }

  /// @internal
  destroy() {
    this.client.unregisterUser(this.uri, this.view)
  }

  /// Get the LSP plugin associated with an editor, if any.
  static get(view: EditorView) {
    return view.plugin(lspPlugin)
  }

  /// Create an editor extension that connects that editor to the given
  /// LSP client. This will cause the client to consider the given
  /// URI/file to be open, and allow the editor to use LSP-related
  /// functionality exported by this package.
  ///
  /// By default, the language ID given to the server for this file is
  /// derived from the editor's language configuration via
  /// [`Language.name`](#language.Language.name). You can pass in
  /// a specific ID as a third parameter.
  static create(client: LSPClient, fileURI: string, languageID?: string): Extension {
    return [lspPlugin.of({client, uri: fileURI, languageID}), lspTheme]
  }
}

export const lspPlugin = ViewPlugin.fromClass(LSPPlugin)
