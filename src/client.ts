import type * as lsp from "vscode-languageserver-protocol"
import {EditorView} from "@codemirror/view"
import {ChangeSet, ChangeDesc, MapMode, Extension, Text} from "@codemirror/state"
import {Language} from "@codemirror/language"
import {lspPlugin, FileState} from "./plugin"
import {toPos} from "./pos"
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

/// A workspace mapping is used to track changes made to open
/// documents between the time a request is started and the time its
/// result comes back.
class WorkspaceMapping {
  private mappings: Map<string, ChangeDesc> = new Map

  /// @internal
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

  /// Map a position in the given file forward from the document the
  /// server had seen when the request was started to the document as
  /// it exists when the request finished.
  mapPos(uri: string, pos: number): number
  mapPos(uri: string, pos: number, mode: MapMode): number | null
  mapPos(uri: string, pos: number, mode: MapMode = MapMode.Simple): number | null {
    let mapping = this.mappings.get(uri)
    return mapping ? mapping.mapPos(pos, mode) : pos
  }

  /// Get the changes made to the document with the given URI during
  /// the request. Returns null for documents that weren't changed or
  /// aren't open.
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

const defaultNotificationHandlers: {[method: string]: (client: LSPClient, params: any) => void} = {
  "window/logMessage": (client, params: lsp.LogMessageParams) => {
    if (params.type == 1) console.error(params.message)
    else if (params.type == 2) console.warn(params.message)
  },
  "window/showMessage": (client, params: lsp.ShowMessageParams) => {
    // FIXME
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
  /// By default, the client will only handle the server notifications
  /// `window/logMessage` (logging warning and errors to the console)
  /// and `window/showMessage`. You can pass additional handlers here.
  /// They will be tried before the built-in handlers, and override
  /// those when they return true.
  notificationHandlers?: {[method: string]: (client: LSPClient, params: any) => boolean}
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
      this.notification<lsp.InitializedParams>("initialized", {})
      this.initialized()
      // FIXME somehow reject this.initializing when connecting fails?
    })
    for (let file of this.openFiles) {
      let editor = this.mainEditor(file.uri)!
      this.notification<lsp.DidOpenTextDocumentParams>("textDocument/didOpen", {
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
      let handler = this.config.notificationHandlers?.[value.method]
      if (handler && handler(this, value.params)) return
      let deflt = defaultNotificationHandlers[value.method]
      if (deflt) deflt(this, value.params)
    }
  }

  /// @internal
  getOpenFile(uri: string) {
    for (let f of this.openFiles) if (f.uri == uri) return f
    return null
  }

  /// Make a request to the server. Returns a promise that resolves to
  /// the response or rejects with a failure message. You'll probably
  /// want to use types from the `vscode-languageserver-protocol`
  /// package for the type parameters.
  ///
  /// The caller is responsible for
  /// [synchronizing](#lsp-client.LSPClient.sync) state before the
  /// request and correctly handling state drift caused by local
  /// changes that happend during the request.
  request<Params, Result>(method: string, params: Params): Promise<Result> {
    return this.initializing.then(() => this.requestInner<Params, Result>(method, params).promise)
  }

  /// Make a request that tracks local changes that happen during the
  /// request. The returned promise resolves to both a response and an
  /// object that tells you about document changes that happened
  /// during the request.
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
  notification<Params>(method: string, params: Params) {
    if (!this.transport) return
    this.initializing.then(() => {
      console.log("notification", method, params)
      let data: lsp.NotificationMessage = {
        jsonrpc: "2.0",
        method,
        params: params as any
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
      this.notification<lsp.DidOpenTextDocumentParams>("textDocument/didOpen", {
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
      this.notification<lsp.DidCloseTextDocumentParams>("textDocument/didClose", {textDocument: {uri}})
      this.openFiles = this.openFiles.filter(f => f != open)
    }
  }

  /// @internal
  mainEditor(uri: string, active?: EditorView) {
    let open = this.getOpenFile(uri), index
    if (!open) return null
    if (active && (index = open.using.indexOf(active)) > -1) {
      if (index) [open.using[index], open.using[0]] = [open.using[0], open.using[index]]
      return active
    }
    return open.using[0]
  }

  sync(editor?: EditorView) {
    for (let file of this.openFiles) {
      let main = this.mainEditor(file.uri, editor)!
      let plugin = main.plugin(lspPlugin)
      if (!plugin) continue
      let {fileState} = plugin
      if (!fileState.changes.empty || fileState.syncedVersion != file.version) {
        file.version++
        if (this.requests.some(r => r.mapBase)) file.history.push(fileState)
        plugin.fileState = new FileState(file.version, ChangeSet.empty(main.state.doc.length))
        this.notification<lsp.DidChangeTextDocumentParams>("textDocument/didChange", {
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
