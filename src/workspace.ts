import {Text, ChangeSet, TransactionSpec} from "@codemirror/state"
import {EditorView} from "@codemirror/view"
import {LSPClient} from "./client"
import {LSPPlugin} from "./plugin"

export interface WorkspaceFile {
  uri: string
  languageId: string
  version: number
  doc: Text
  getView(main?: EditorView): EditorView | null
}

export interface WorkspaceFileUpdate {
  file: WorkspaceFile
  prevDoc: Text
  changes: ChangeSet
}

// FIXME consider making this an abstract class
export interface Workspace {
  files: WorkspaceFile[]
  getFile(uri: string) : WorkspaceFile | null

  syncFiles(): readonly WorkspaceFileUpdate[]

  requestFile(uri: string): WorkspaceFile | null | Promise<WorkspaceFile | null>

  /// Called when an editor is created for a file.
  openFile(uri: string, languageId: string, view: EditorView): void
  closeFile(uri: string, view: EditorView): void

  connected(): void
  disconnected(): void

  createFile(uri: string): void
  renameFile(uri: string, newURI: string): void
  deleteFile(uri: string): void
  updateFile(uri: string, update: TransactionSpec): void

  /// When the client needs to put a file other than the one loaded in
  /// the current editor in front of the user, for example in
  /// [`jumpToDefinition`](#lsp-client.jumpToDefinition), it will call
  /// this function. It should make sure to create or find an editor
  /// with the file and make it visible to the user, or return null if
  /// this isn't possible.
  displayFile(uri: string): Promise<EditorView | null>
}

class DefaultWorkspaceFile implements WorkspaceFile {
  constructor(readonly uri: string,
              readonly languageId: string,
              public version: number,
              public doc: Text,
              readonly view: EditorView) {}

  getView() { return this.view }
}

export class DefaultWorkspace implements Workspace {
  files: DefaultWorkspaceFile[] = []
  private fileVersions: {[uri: string]: number} = Object.create(null)

  constructor(readonly client: LSPClient) {}

  getFile(uri: string) {
    return this.files.find(f => f.uri == uri) || null
  }

  requestFile(uri: string): WorkspaceFile | null | Promise<WorkspaceFile | null> {
    return null
  }

  nextFileVersion(uri: string) {
    return this.fileVersions[uri] = (this.fileVersions[uri] ?? -1) + 1
  }

  connected() {
    for (let file of this.files) this.client.didOpen(file)
  }

  disconnected() {}

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

  createFile(uri: string): void {}
  renameFile(uri: string, newURI: string): void {}
  deleteFile(uri: string): void {}

  updateFile(uri: string, update: TransactionSpec): void {
    let file = this.getFile(uri)
    if (file) file.view.dispatch(update)
  }

  displayFile(uri: string) {
    let file = this.getFile(uri)
    return Promise.resolve(file ? file.view : null)
  }
}
