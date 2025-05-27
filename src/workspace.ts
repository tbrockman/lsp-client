import {Text, ChangeSet, TransactionSpec} from "@codemirror/state"
import {EditorView} from "@codemirror/view"
import {LSPClient} from "./client"
import {LSPPlugin} from "./plugin"

/// A file that is active in a workspace.
export interface WorkspaceFile {
  /// The file's unique URI.
  uri: string
  /// The LSP language ID for the file's content.
  languageId: string
  /// The current version of the file.
  version: number
  /// The document corresponding to `this.version`. May be behind the
  /// content of an editor, in which case both this and the version
  /// should be updated when
  /// [`syncFiles`](#lsp-client.Workspace.syncFiles) is called.
  doc: Text
  /// Get an active editor view for this file, if there is one. With
  /// workspaces that support multiple view on a file, `main`
  /// indicates a preferred view.
  getView(main?: EditorView): EditorView | null
}

interface WorkspaceFileUpdate {
  file: WorkspaceFile
  prevDoc: Text
  changes: ChangeSet
}

/// Providing your own workspace class can provide more control over
/// the way files are loaded and managed when interacting with the
/// language server.
export abstract class Workspace {
  /// The files currently open in the workspace.
  abstract files: WorkspaceFile[]

  /// The constructor, as called by the client when creating a
  /// workspace.
  constructor(readonly client: LSPClient) {}

  /// Find the open file with the given URI, if it exists. The default
  /// implementation just looks it up in `this.files`.
  getFile(uri: string) : WorkspaceFile | null {
    return this.files.find(f => f.uri == uri) || null
  }

  /// Check all open files for changes (usually from editors, but they
  /// may also come from other sources). When a file is changed,
  /// return a record that describes the changes, and update its
  /// [`version`](#lsp-client.WorkspaceFile.version) and
  /// [`doc`](#lsp-client.WorkspaceFile.doc) properties to reflect the
  /// new version.
  abstract syncFiles(): readonly WorkspaceFileUpdate[]

  /// Called to request that the workspace open a file. The default
  /// implementation simply returns null.
  requestFile(uri: string): WorkspaceFile | null | Promise<WorkspaceFile | null> {
    return null
  }

  /// Called when an editor is created for a file. The implementation
  /// should track the file in
  /// [`this.files`](#lsp-client.Workspace.files) and, if it wasn't
  /// open already, call
  /// [`LSPClient.didOpen`](#lsp-client.LSPClient.didOpen).
  abstract openFile(uri: string, languageId: string, view: EditorView): void

  /// Called when an editor holding this file is destroyed or
  /// reconfigured to no longer hold it. The implementation should
  /// track this and, when it closes the file, make sure to call
  /// [`LSPClient.didOpen`](#lsp-client.LSPClient.didClose).
  abstract closeFile(uri: string, view: EditorView): void

  /// Called when the client for this workspace is connected. The
  /// default implementation calls
  /// [`LSPClient.didOpen`](#lsp-client.LSPClient.didOpen) on all open
  /// files.
  connected(): void {
    for (let file of this.files) this.client.didOpen(file)
  }

  /// Called when the client for this workspace is disconnected. The
  /// default implementation does nothing.
  disconnected(): void {}

  /// FIXME document or remove
  createFile(uri: string): void {}
  renameFile(uri: string, newURI: string): void {}
  deleteFile(uri: string): void {}

  /// Called when a server-initiated change to a file is applied. The
  /// default implementation simply dispatches the update to the
  /// file's view, if the file is open and has a view.
  updateFile(uri: string, update: TransactionSpec): void {
    let file = this.getFile(uri)
    if (file) file.getView()?.dispatch(update)
  }

  /// When the client needs to put a file other than the one loaded in
  /// the current editor in front of the user, for example in
  /// [`jumpToDefinition`](#lsp-client.jumpToDefinition), it will call
  /// this function. It should make sure to create or find an editor
  /// with the file and make it visible to the user, or return null if
  /// this isn't possible.
  displayFile(uri: string): Promise<EditorView | null> {
    let file = this.getFile(uri)
    return Promise.resolve(file ? file.getView() : null)
  }
}

class DefaultWorkspaceFile implements WorkspaceFile {
  constructor(readonly uri: string,
              readonly languageId: string,
              public version: number,
              public doc: Text,
              readonly view: EditorView) {}

  getView() { return this.view }
}

export class DefaultWorkspace extends Workspace {
  files: DefaultWorkspaceFile[] = []
  private fileVersions: {[uri: string]: number} = Object.create(null)

  nextFileVersion(uri: string) {
    return this.fileVersions[uri] = (this.fileVersions[uri] ?? -1) + 1
  }

  syncFiles() {
    let result: WorkspaceFileUpdate[] = []
    for (let file of this.files) {
      let plugin = LSPPlugin.get(file.view)
      if (!plugin) continue
      let changes = plugin.unsyncedChanges
      if (!changes.empty) {
        result.push({changes, file, prevDoc: file.doc})
        file.doc = file.view.state.doc
        file.version = this.nextFileVersion(file.uri)
        plugin.clear()
      }
    }
    return result
  }

  openFile(uri: string, languageId: string, view: EditorView) {
    if (this.getFile(uri))
      throw new Error("Default workspace implementation doesn't support multiple views on the same file")
    let file = new DefaultWorkspaceFile(uri, languageId, this.nextFileVersion(uri), view.state.doc, view) 
    this.files.push(file)
    this.client.didOpen(file)
  }

  closeFile(uri: string) {
    let file = this.getFile(uri)
    if (file) {
      this.files = this.files.filter(f => f != file)
      this.client.didClose(uri)
    }
  }
}
