import type * as lsp from "vscode-languageserver-protocol"
import {EditorView, showDialog} from "@codemirror/view"
import {ChangeSet, ChangeDesc, MapMode, Text} from "@codemirror/state"
import {Language} from "@codemirror/language"
import {lspPlugin, FileState} from "./plugin"
import {toPos} from "./pos"

class Request<Result> {
  declare resolve: (result: Result) => void
  declare reject: (error: any) => void
  started = Date.now()
  promise: Promise<Result>

  constructor(
    readonly id: number,
    readonly params: any
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

  constructor(readonly uri: string, readonly languageId: string) {}

  mainEditor(active?: EditorView) {
    let index
    if (active && (index = this.using.indexOf(active)) > -1) {
      if (index) [this.using[index], this.using[0]] = [this.using[0], this.using[index]]
      return active
    }
    return this.using[0]
  }
}

/// A workspace mapping is used to track changes made to open
/// documents between the time a request is started and the time its
/// result comes back.
class WorkspaceMapping {
  // @internal
  mappings: Map<string, {view: EditorView, start: Text, changes: ChangeDesc, version: number}> = new Map

  /// @internal
  constructor(client: LSPClient) {
    for (let file of client.openFiles) {
      let view = file.mainEditor()
      if (view) this.mappings.set(file.uri, {
        view,
        start: view.state.doc,
        changes: ChangeSet.empty(view.state.doc.length),
        version: file.version
      })
    }
  }

  finish() {
    for (let record of this.mappings.values()) {
      let plugin = record.view.plugin(lspPlugin)
      if (plugin) record.changes = record.changes.composeDesc(plugin.fileState.changes)
    }
  }

  /// Map a position in the given file forward from the document the
  /// server had seen when the request was started to the document as
  /// it exists when the request finished.
  mapPos(uri: string, pos: number): number
  mapPos(uri: string, pos: number, mode: MapMode): number | null
  mapPos(uri: string, pos: number, mode: MapMode = MapMode.Simple): number | null {
    let record = this.mappings.get(uri)
    return record ? record.changes.mapPos(pos, mode) : pos
  }

  /// Get the changes made to the document with the given URI during
  /// the request. Returns null for documents that weren't changed or
  /// aren't open.
  getMapping(uri: string) {
    let record = this.mappings.get(uri)
    return record ? record.changes : null
  }

  // FIXME maybe allow direct conversion of old-doc Position objects
}

/// An object of this type should be used to wrap whatever transport
/// layer you use to talk to your language server. Messages should
/// contain only the JSON messages, no LSP headers.
export type Transport = {
  /// Send a message to the server. Should throw if the connection is
  /// broken somehow.
  send(message: string): void
  /// Register a handler for messages coming from the server.
  subscribe(handler: (value: string) => void): void
  /// Unregister a handler registered with `subscribe`.
  unsubscribe(handler: (value: string) => void): void
}

const defaultNotificationHandlers: {[method: string]: (client: LSPClient, params: any) => void} = {
  "window/logMessage": (client, params: lsp.LogMessageParams) => {
    if (params.type == 1) console.error("[lsp] " + params.message)
    else if (params.type == 2) console.warn("[lsp] " + params.message)
  },
  "window/showMessage": (client, params: lsp.ShowMessageParams) => {
    if (!client.openFiles.length || params.type > 3 /* Info */) return
    let view = client.openFiles[0].using[0]
    showDialog(view, {
      label: params.message,
      class: "cm-lsp-message cm-lsp-message-" + (params.type == 1 ? "error" : params.type == 2 ? "warning" : "info"),
      top: true
    })
  }
}

/// Configuration options that can be passed to the LSP client.
export type LSPClientConfig = {
  /// The amount of milliseconds after which requests are
  /// automatically timed out. Defaults to 3000.
  timeout?: number
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
  /// When no handler is found for a notification, it will be passed
  /// to this function, if given.
  unhandledNotification?: (client: LSPClient, method: string, params: any) => void
}

/// An LSP client manages a connection to a language server. It should
/// be explicitly [connected](#lsp-client.LSPClient.connect) before
/// use.
export class LSPClient {
  /// The transport active in the client, if it is connected.
  transport: Transport | null = null
  private nextID = 0
  private requests: Request<any>[] = []
  private activeMappings: WorkspaceMapping[] = []
  /// @internal
  openFiles: OpenFile[] = []
  /// The capabilities advertised by the server. Will be null when not
  /// connected or initialized.
  serverCapabilities: lsp.ServerCapabilities | null = null
  /// A promise that resolves the client is connected. Will be
  /// replaced by a new promise object when you call `disconnect`.
  initializing: Promise<null>
  declare private init: {resolve: (value: null) => void, reject: (err: any) => void}
  private timeoutWorker = 0
  private timeout: number

  /// Create a client object.
  constructor(readonly config: LSPClientConfig = {}) {
    this.receiveMessage = this.receiveMessage.bind(this)
    this.initializing = new Promise((resolve, reject) => this.init = {resolve, reject})
    this.timeout = config.timeout ?? 3000
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
      this.init.resolve(null)
    }, this.init.reject)
    for (let file of this.openFiles) {
      let editor = file.mainEditor()
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
    this.serverCapabilities = null
    this.initializing = new Promise((resolve, reject) => this.init = {resolve, reject})
  }

  private receiveMessage(msg: string) {
    const value = JSON.parse(msg) as lsp.ResponseMessage | lsp.NotificationMessage | lsp.RequestMessage
    if ("id" in value && !("method" in value)) {
      let index = this.requests.findIndex(r => r.id == value.id)
      if (index < 0) {
        console.warn(`[lsp] Received a response for non-existent request ${value.id}`)
      } else {
        let req = this.requests[index]
        this.requests.splice(index, 1)
        if (value.error) req.reject(value.error)
        else req.resolve(value.result)
      }
    } else if (!("id" in value)) {
      let handler = this.config.notificationHandlers?.[value.method]
      if (handler && handler(this, value.params)) return
      let deflt = defaultNotificationHandlers[value.method]
      if (deflt) deflt(this, value.params)
      else if (this.config.unhandledNotification) this.config.unhandledNotification(this, value.method, value.params)
    } else {
      let resp: lsp.ResponseMessage = {
        jsonrpc: "2.0",
        id: value.id,
        error: {code: -32601 /* MethodNotFound */, message: "Method not implemented"}
      }
      this.transport!.send(JSON.stringify(resp))
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
    let mapping = new WorkspaceMapping(this)
    this.activeMappings.push(mapping)
    return this.initializing.then(() => {
      let req = this.requestInner<Params, Result>(method, params, true)
      return req.promise.then(response => {
        this.activeMappings = this.activeMappings.filter(m => m != mapping)
        mapping.finish()
        return {response, mapping}
      })
    }).catch(e => {
      this.activeMappings = this.activeMappings.filter(m => m != mapping)
      throw e
    })
  }

  private requestInner<Params, Result>(
    method: string,
    params: Params,
    mapped = false
  ): Request<Result> {
    if (!this.transport) throw new Error("Client not connected")
    let id = ++this.nextID, data: lsp.RequestMessage = {
      jsonrpc: "2.0",
      id,
      method,
      params: params as any
    }
    let req = new Request<Result>(id, params)
    this.requests.push(req)
    if (this.timeoutWorker == 0) this.timeoutWorker = setTimeout(() => this.timeoutRequests(), this.timeout + 10)
    try { this.transport!.send(JSON.stringify(data)) }
    catch(e) { req.reject(e) }
    return req
  }

  /// Send a notification to the server.
  notification<Params>(method: string, params: Params) {
    if (!this.transport) return
    this.initializing.then(() => {
      let data: lsp.NotificationMessage = {
        jsonrpc: "2.0",
        method,
        params: params as any
      }
      this.transport!.send(JSON.stringify(data))
    })
  }

  /// Cancel the in-progress request with the given parameter value
  /// (which is compared by identity).
  cancelRequest(params: any) {
    let found = this.requests.find(r => r.params === params)
    if (found) this.notification("$/cancelRequest", found.id)
  }

  /// Check whether the server has a given property in its capability
  /// object. Returns null when the connection hasn't finished
  /// initializing yet.
  hasCapability(name: keyof lsp.ServerCapabilities) {
    return this.serverCapabilities ? !!this.serverCapabilities[name] : null
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
      this.openFiles = this.openFiles.filter(f => f != open)
      this.notification<lsp.DidCloseTextDocumentParams>("textDocument/didClose", {textDocument: {uri}})
    }
  }

  /// @internal
  sync(editor?: EditorView) {
    for (let file of this.openFiles) {
      let main = file.mainEditor(editor)
      let plugin = main.plugin(lspPlugin)
      if (!plugin) continue
      let {fileState} = plugin
      if (!fileState.changes.empty || fileState.syncedVersion != file.version) {
        for (let mapping of this.activeMappings) {
          let record = mapping.mappings.get(file.uri)
          if (record) {
            if (record.version == file.version) {
              record.changes = record.changes.composeDesc(fileState.changes)
              record.version++
            } else {
              mapping.mappings.delete(file.uri)
            }
          }
        }
        file.version++
        plugin.fileState = new FileState(file.version, ChangeSet.empty(main.state.doc.length))
        this.notification<lsp.DidChangeTextDocumentParams>("textDocument/didChange", {
          textDocument: {uri: file.uri, version: file.version},
          contentChanges: contentChangesFor(file, fileState, main.state.doc)
        })
      }
    }
  }

  private timeoutRequests() {
    this.timeoutWorker = 0
    let now = Date.now(), next = -1
    for (let i = 0; i < this.requests.length; i++) {
      let req = this.requests[i]
      if (req.started + this.timeout <= now) {
        req.reject(new Error("Request timed out"))
        this.requests.splice(i--, 1)
      } else {
        let end = req.started + this.timeout
        next = next < 0 ? end : Math.min(next, end)
      }
    }
    if (next > -1) this.timeoutWorker = setTimeout(() => this.timeoutRequests(), next - now + 10)
  }
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
