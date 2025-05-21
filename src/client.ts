import type * as lsp from "vscode-languageserver-protocol"
import {EditorView} from "@codemirror/view"
import {ChangeSet, ChangeDesc, MapMode, Extension, Text} from "@codemirror/state"
import {Language} from "@codemirror/language"
import {lspPlugin, FileState} from "./plugin"
import {toPos} from "./pos"
import {docToHTML, withContext} from "./text"
import {lspTheme} from "./theme"

// FIXME go over error routing

class Request<Result> {
  declare resolve: (result: Result) => void
  declare reject: (error: any) => void
  started = Date.now()
  promise: Promise<Result>
  mapBase: readonly lsp.VersionedTextDocumentIdentifier[] | null = null

  constructor(
    readonly id: number
  ) {
    this.promise = new Promise((resolve, reject) => {
      this.resolve = resolve
      this.reject = reject
    })
  }
}

// FIXME make simple type parameter
type Notifications = {
  "textDocument/didOpen": lsp.DidOpenTextDocumentParams,
  "textDocument/didClose": lsp.DidCloseTextDocumentParams,
  "textDocument/didChange": lsp.DidChangeTextDocumentParams,
  "initialized": lsp.InitializedParams,
  "window/logMessage": lsp.LogMessageParams,
  "window/showMessage": lsp.ShowMessageParams,
  "window/showMessageRequest": lsp.ShowMessageRequestParams,
  "window/showDocument": lsp.ShowDocumentParams,
}

const clientCapabilities: lsp.ClientCapabilities = {
  general: {
    markdown: {
      parser: "marked",
    },
  },            
  textDocument: {
    completion: {
      completionItem: {
        snippetSupport: true,
        documentationFormat: ["plaintext", "markdown"],
        insertReplaceSupport: false,
      },
      completionList: {
        itemDefaults: ["commitCharacters", "editRange", "insertTextFormat"]
      },
      completionItemKind: {valueSet: []},
      contextSupport: true,
    },
    hover: {
      contentFormat: ["markdown", "plaintext"]
    },
    formatting: {},
    rename: {},
    signatureHelp: {
      contextSupport: true,
      signatureInformation: {
        documentationFormat: ["markdown", "plaintext"],
        parameterInformation: {labelOffsetSupport: true},
        activeParameterSupport: true,
      },
    },
  },
}

class OpenFile {
  version = 0
  using: EditorView[] = []
  requests: number[] = []
  history: FileState[] = []

  constructor(readonly uri: string, readonly languageId: string) {}
}

class WorkspaceMapping {
  mappings: Map<string, ChangeDesc> = new Map

  constructor(client: LSPClient, base: readonly lsp.VersionedTextDocumentIdentifier[]) {
    for (let {uri, version} of base) {
      let file = client.getOpenFile(uri)
      if (!file) continue
      let changes: ChangeDesc | null = null
      for (let v = version; v < file.version; v++) {
        let step = file.history.find(s => s.syncedVersion == v)
        if (!step) throw new Error("No mapping available for file " + uri)
        changes = changes ? changes.composeDesc(step.changes) : step.changes.desc
      }
      let main = client.mainEditor(uri), plugin = main && main.plugin(lspPlugin)
      if (!plugin) continue
      changes = changes ? changes.composeDesc(plugin.fileState.changes) : plugin.fileState.changes.desc
      this.mappings.set(uri, changes)
    }
  }

  mapPos(uri: string, pos: number): number
  mapPos(uri: string, pos: number, mode: MapMode): number | null
  mapPos(uri: string, pos: number, mode: MapMode = MapMode.Simple): number | null {
    let mapping = this.mappings.get(uri)
    return mapping ? mapping.mapPos(pos, mode) : pos
  }

  getMapping(uri: string) {
    return this.mappings.get(uri)
  }
}

function isNotification(msg: lsp.ResponseMessage | lsp.NotificationMessage): msg is lsp.NotificationMessage {
  return (msg as any).id == null
}

/// An object of this type should be used to wrap whatever transport
/// layer you use to talk to your language server. Messages should
/// contain only the JSON messages, no LSP headers.
export type Transport = {
  /// Send a message to the server.
  send(message: string): void
  /// Register a handler for messages coming from the server.
  subscribe(handler: (value: string) => void): void
  /// Unregister a handler registered with `subscribe`.
  unsubscribe(handler: (value: string) => void): void
}

// FIXME handle others
const notificationHandlers: {[method in keyof Notifications]?: (client: LSPClient, params: Notifications[method]) => void} = {
  "window/logMessage": (client, params) => {
    if (params.type == 1) console.error(params.message)
    else if (params.type == 2) console.warn(params.message)
  }
}

/// Configuration options that can be passed to the LSP client.
export type LSPClientConfig = {
  /// LSP servers can send Markdown code, which the client must render
  /// and display as HTML. Markdown can contain arbitrary HTML and is
  /// thus a potential channel for cross-site scripting attacks, if
  /// someone is able to compromise your LSP server or your connection
  /// to it. You can pass an HTML sanitizer here to strip out
  /// suspicious HTML structure.
  sanitizeHTML?: (html: string) => string
  /// By default, the Markdown renderer will only be able to highlght
  /// code embedded in the Markdown text when its language tag matches
  /// the name of the language used by the editor. You can provide a
  /// function here that returns a CodeMirror language object for a
  /// given language tag to support morelanguages.
  highlightLanguage?: (name: string) => Language | null
  /// Some actions, like symbol rename, can cause the server to return
  /// changes in files other than the one the active editor has open.
  /// When this happens, the client will try to call this handler,
  /// when given, to process such changes. If it is not provided, or
  /// it returns false, and another editor view has the given URI
  /// open, the changes will be dispatched to the other editor.
  handleChangeInFile?: (uri: string, changes: lsp.TextEdit[]) => boolean
}

/// An LSP client manages a connection to a language server. It should
/// be explicitly [connected](#lsp-client.LSPClient.connect) before
/// use.
export class LSPClient {
  /// The transport active in the client, if it is connected.
  transport: Transport | null = null
  private nextID = 0
  private requests: Request<any>[] = []
  /// @internal
  openFiles: OpenFile[] = []
  /// The capabilities advertised by the server. Will be the empty
  /// object when not connected.
  serverCapabilities: lsp.ServerCapabilities = {}
  /// A promise that resolves the client is connected. Will be
  /// replaced by a new promise object when you call `disconnect`.
  initializing: Promise<null>
  declare private initialized: () => void

  /// Create a client object.
  constructor(readonly config: LSPClientConfig = {}) {
    this.receiveMessage = this.receiveMessage.bind(this)
    this.initializing = new Promise(resolve => this.initialized = () => resolve(null))
  }

  /// Connect this client to a server over the given transport. Will
  /// immediately start the initialization exchange with the server,
  /// and resolve `this.initializing` (which it also returns) when
  /// successful.
  connect(transport: Transport) {
    if (this.transport) this.transport.unsubscribe(this.receiveMessage)
    this.transport = transport
    transport.subscribe(this.receiveMessage)
    this.requestInner<lsp.InitializeParams, lsp.InitializeResult>("initialize", {
      processId: null,
      clientInfo: {name: "@codemirror/lsp-client"},
      rootUri: null,
      capabilities: clientCapabilities
    }).promise.then(resp => {
      this.serverCapabilities = resp.capabilities
      this.notification("initialized", {})
      this.initialized()
      // FIXME somehow reject this.initializing when connecting fails?
    })
    for (let file of this.openFiles) {
      let editor = this.mainEditor(file.uri)!
      this.notification("textDocument/didOpen", {
        textDocument: {
          uri: file.uri,
          languageId: file.languageId,
          text: editor.state.doc.toString(),
          version: file.version
        }
      })
    }
    return this.initializing
  }

  /// Disconnect the client from the server.
  disconnect() {
    if (this.transport) this.transport.unsubscribe(this.receiveMessage)
    this.serverCapabilities = {}
    this.initializing = new Promise(resolve => this.initialized = () => resolve(null))
  }

  private receiveMessage(msg: string) {
    let value = JSON.parse(msg) as lsp.ResponseMessage | lsp.NotificationMessage
    console.log("received", value)
    if (!isNotification(value)) {
      let index = this.requests.findIndex(r => r.id == (value as lsp.ResponseMessage).id)
      if (index < 0) {
        console.warn(`Received a response for non-existent request ${value.id}`)
      } else {
        let req = this.requests[index]
        this.requests.splice(index, 1)
        if (value.error) req.reject(value.error)
        else req.resolve(value.result)
      }
    } else {
      let handler = (notificationHandlers as any)[value.method]
      if (handler) handler(this, value.params)
      else console.log("dropping notification", value)
    }
  }

  /// @internal
  getOpenFile(uri: string) {
    for (let f of this.openFiles) if (f.uri == uri) return f
    return null
  }

  /// FIXME document request methods
  request<Params, Result>(method: string, params: Params): Promise<Result> {
    return this.initializing.then(() => this.requestInner<Params, Result>(method, params).promise)
  }

  /// @internal
  mappedRequest<Params, Result>(method: string, params: Params): Promise<{
    response: Result,
    mapping: WorkspaceMapping
  }> {
    return this.initializing.then(() => {
      let req = this.requestInner<Params, Result>(method, params, true)
      req.mapBase = this.openFiles.map(f => ({uri: f.uri, version: f.version}))
      return req.promise.then(response => {
        let mapping = new WorkspaceMapping(this, req.mapBase!)
        this.cleanMapping()
        return {response, mapping}
      })
    })
  }

  private requestInner<Params, Result>(
    method: string,
    params: Params,
    mapped = false
  ): Request<Result> {
    if (!this.transport) throw new Error("Client not connected")
    console.log("request", method, params)
    let id = ++this.nextID, data: lsp.RequestMessage = {
      jsonrpc: "2.0",
      id,
      method,
      params: params as any
    }
    let req = new Request<Result>(id)
    this.requests.push(req)
    this.transport!.send(JSON.stringify(data))
    return req
  }

  /// @internal
  notification<Method extends keyof Notifications>(method: Method, params: Notifications[Method]) {
    if (!this.transport) return
    this.initializing.then(() => {
      console.log("notification", method, params)
      let data: lsp.NotificationMessage = {
        jsonrpc: "2.0",
        method,
        params
      }
      this.transport!.send(JSON.stringify(data))
    })
  }

  /// @internal
  registerUser(uri: string, languageId: string, view: EditorView) {
    let found = this.getOpenFile(uri)
    if (!found) {
      found = new OpenFile(uri, languageId)
      this.openFiles.push(found)
      this.notification("textDocument/didOpen", {
        textDocument: {
          uri,
          languageId,
          text: view.state.doc.toString(),
          version: found.version
        }
      })
    }
    found.using.unshift(view)
    return found.version
  }

  /// @internal
  unregisterUser(uri: string, view: EditorView) {
    let open = this.getOpenFile(uri)
    if (!open) return
    let idx = open.using.indexOf(view)
    if (idx < 0) return
    open.using.splice(idx, 1)
    if (!open.using.length) {
      this.notification("textDocument/didClose", {textDocument: {uri}})
      this.openFiles = this.openFiles.filter(f => f != open)
    }
  }

  /// @internal
  mainEditor(uri: string, active?: EditorView) {
    let open = this.getOpenFile(uri)
    if (!open) return null
    if (active && open.using.indexOf(active) > -1) return active
    return open.using[0]
  }

  private sync(editor?: EditorView) {
    for (let file of this.openFiles) {
      let main = this.mainEditor(file.uri, editor)!
      let plugin = main.plugin(lspPlugin)
      if (!plugin) continue
      let {fileState} = plugin
      if (!fileState.changes.empty || fileState.syncedVersion != file.version) {
        file.version++
        if (this.requests.some(r => r.mapBase)) file.history.push(fileState)
        plugin.fileState = new FileState(file.version, ChangeSet.empty(main.state.doc.length))
        this.notification("textDocument/didChange", {
          textDocument: {uri: file.uri, version: file.version},
          contentChanges: contentChangesFor(file, fileState, main.state.doc)
        })
      }
    }
  }

  private cleanMapping() {
    let oldest: Map<string, number> = new Map
    for (let req of this.requests) if (req.mapBase) {
      for (let {uri, version} of req.mapBase) {
        let cur = oldest.get(uri)
        oldest.set(uri, cur == null ? version : Math.min(version, cur))
      }
    }
    if (oldest.size) for (let file of this.openFiles) {
      let minVer = oldest.get(file.uri)
      if (file.history.length) file.history = minVer == null ? [] : file.history.filter(s => s.syncedVersion >= minVer!)
    }
  }

  /// @internal
  docToHTML(view: EditorView, value: string | lsp.MarkupContent, defaultKind: lsp.MarkupKind = "plaintext") {
    let html = withContext(view, this.config.highlightLanguage, () => docToHTML(value, defaultKind))
    return this.config.sanitizeHTML ? this.config.sanitizeHTML(html) : html
  }

  completions(view: EditorView, pos: number, explicit: boolean) {
    this.sync(view)
    return this.request<lsp.CompletionParams, lsp.CompletionItem[] | lsp.CompletionList | null>("textDocument/completion", {
      position: toPos(view.state.doc, pos),
      textDocument: {uri: editorURI(view)},
      context: {triggerKind: explicit ? 1 : 2}
    })
  }

  hover(view: EditorView, pos: number) {
    this.sync(view)
    return this.request<lsp.HoverParams, lsp.Hover | null>("textDocument/hover", {
      position: toPos(view.state.doc, pos),
      textDocument: {uri: editorURI(view)},
    })
  }

  formatting(view: EditorView, options: lsp.FormattingOptions) {
    this.sync(view)
    return this.mappedRequest<lsp.DocumentFormattingParams, lsp.TextEdit[] | null>("textDocument/formatting", {
      options,
      textDocument: {uri: editorURI(view)},
    })
  }

  rename(view: EditorView, pos: number, newName: string) {
    this.sync(view)
    return this.mappedRequest<lsp.RenameParams, lsp.WorkspaceEdit | null>("textDocument/rename", {
      newName,
      position: toPos(view.state.doc, pos),
      textDocument: {uri: editorURI(view)},
    })
  }

  signatureHelp(view: EditorView, pos: number, context: lsp.SignatureHelpContext) {
    this.sync(view)
    return this.request<lsp.SignatureHelpParams, lsp.SignatureHelp | null>("textDocument/signatureHelp", {
      context,
      position: toPos(view.state.doc, pos),
      textDocument: {uri: editorURI(view)},
    })
  }
}

function editorURI(view: EditorView) {
  let plugin = view.plugin(lspPlugin)
  if (!plugin) throw new Error("Editor view doesn't have the LSP plugin loaded")
  return plugin.uri
}

/// Create an editor extension that connects that editor to the given
/// LSP client. This will cause the client to consider the given
/// URI/file to be open, and allow the editor to use LSP-related
/// functionality exported by this package.
export function languageServerSupport(client: LSPClient, fileURI: string): Extension {
  return [lspPlugin.of({client, uri: fileURI}), lspTheme]
}

const enum Sync { AlwaysIfSmaller = 1024 }

function contentChangesFor(file: OpenFile, fileState: FileState, doc: Text): lsp.TextDocumentContentChangeEvent[] {
  if (file.version != fileState.syncedVersion || doc.length < Sync.AlwaysIfSmaller)
    return [{text: doc.toString()}]
  let events: lsp.TextDocumentContentChangeEvent[] = []
  fileState.changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
    events.push({
      range: {start: toPos(doc, fromA), end: toPos(doc, toA)},
      text: inserted.toString()
    })
  })
  return events
}
