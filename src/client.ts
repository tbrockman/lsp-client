import type * as lsp from "vscode-languageserver-protocol"
import {EditorView} from "@codemirror/view"
import {ChangeSet, ChangeDesc, MapMode, Extension, Text} from "@codemirror/state"
import {Language} from "@codemirror/language"
import {lspPlugin, FileState} from "./plugin.js"
import {toPos} from "./pos.js"
import {docToHTML, withContext} from "./text.js"
import {lspTheme} from "./theme.js"

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

type Requests = {
  "initialize": [lsp.InitializeParams, lsp.InitializeResult],
  "textDocument/completion": [lsp.CompletionParams, lsp.CompletionItem[] | lsp.CompletionList | null],
  "textDocument/hover": [lsp.HoverParams, lsp.Hover | null],
  "textDocument/formatting": [lsp.DocumentFormattingParams, lsp.TextEdit[] | null],
  "textDocument/rename": [lsp.RenameParams, lsp.WorkspaceEdit | null],
  "textDocument/signatureHelp": [lsp.SignatureHelpParams, lsp.SignatureHelp | null],
}

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

export type Transport = {
  send(message: string): void
  subscribe(handler: (value: string) => void): void
  unsubscribe(handler: (value: string) => void): void
}

const notificationHandlers: {[method in keyof Notifications]?: (client: LSPClient, params: Notifications[method]) => void} = {
  "window/logMessage": (client, params) => {
    if (params.type == 1) console.error(params.message)
    else if (params.type == 2) console.warn(params.message)
  }
}

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

export class LSPClient {
  transport: Transport | null = null
  nextID = 0
  requests: Request<any>[] = []
  openFiles: OpenFile[] = []
  serverCapabilities: lsp.ServerCapabilities = {}
  initializing: Promise<null>
  declare initialized: () => void

  constructor(readonly config: LSPClientConfig = {}) {
    this.receiveMessage = this.receiveMessage.bind(this)
    this.initializing = new Promise(resolve => this.initialized = () => resolve(null))
  }

  connect(transport: Transport) {
    this.transport = transport
    transport.subscribe(this.receiveMessage)
    this.requestInner("initialize", {
      processId: null,
      clientInfo: {name: "@codemirror/lsp-client"},
      rootUri: null,
      capabilities: clientCapabilities
    }).promise.then(resp => {
      this.serverCapabilities = resp.capabilities
      this.notification("initialized", {})
      this.initialized()
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
  }

  disconnect() {
    if (this.transport) this.transport.unsubscribe(this.receiveMessage)
    this.serverCapabilities = {}
    this.initializing = new Promise(resolve => this.initialized = () => resolve(null))
  }

  receiveMessage(msg: string) {
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

  getOpenFile(uri: string) {
    for (let f of this.openFiles) if (f.uri == uri) return f
    return null
  }

  request<Method extends keyof Requests>(method: Method, params: Requests[Method][0]): Promise<Requests[Method][1]> {
    return this.initializing.then(() => this.requestInner(method, params).promise)
  }

  mappedRequest<Method extends keyof Requests>(method: Method, params: Requests[Method][0]): Promise<{
    response: Requests[Method][1],
    mapping: WorkspaceMapping
  }> {
    return this.initializing.then(() => {
      let req = this.requestInner(method, params, true)
      req.mapBase = this.openFiles.map(f => ({uri: f.uri, version: f.version}))
      return req.promise.then(response => {
        let mapping = new WorkspaceMapping(this, req.mapBase!)
        this.cleanMapping()
        return {response, mapping}
      })
    })
  }

  requestInner<Method extends keyof Requests>(
    method: Method,
    params: Requests[Method][0],
    mapped = false
  ): Request<Requests[Method][1]> {
    if (!this.transport) throw new Error("Client not connected")
    console.log("request", method, params)
    let id = ++this.nextID, data: lsp.RequestMessage = {
      jsonrpc: "2.0",
      id,
      method,
      params
    }
    let req = new Request<Requests[Method][1]>(id)
    this.requests.push(req)
    this.transport!.send(JSON.stringify(data))
    return req
  }

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

  mainEditor(uri: string, active?: EditorView) {
    let open = this.getOpenFile(uri)
    if (!open) return null
    if (active && open.using.indexOf(active) > -1) return active
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

  docToHTML(view: EditorView, value: string | lsp.MarkupContent, defaultKind: lsp.MarkupKind = "plaintext") {
    let html = withContext(view, this.config.highlightLanguage, () => docToHTML(value, defaultKind))
    return this.config.sanitizeHTML ? this.config.sanitizeHTML(html) : html
  }

  completions(view: EditorView, pos: number, explicit: boolean) {
    // FIXME this will short-circuit if the client isn't initialized, mooting the wait for init later
    if (!this.serverCapabilities.completionProvider) return Promise.resolve(null)
    this.sync(view)
    return this.request("textDocument/completion", {
      position: toPos(view.state.doc, pos),
      textDocument: {uri: editorURI(view)},
      context: {triggerKind: explicit ? 1 : 2}
    })
  }

  hover(view: EditorView, pos: number) {
    if (!this.serverCapabilities.hoverProvider) return Promise.resolve(null)
    this.sync(view)
    return this.request("textDocument/hover", {
      position: toPos(view.state.doc, pos),
      textDocument: {uri: editorURI(view)},
    })
  }

  formatting(view: EditorView, options: lsp.FormattingOptions) {
    if (!this.serverCapabilities.documentFormattingProvider)
      return Promise.reject(new Error("Server does not support formatting"))
    this.sync(view)
    return this.mappedRequest("textDocument/formatting", {
      options,
      textDocument: {uri: editorURI(view)},
    })
  }

  rename(view: EditorView, pos: number, newName: string) {
    if (!this.serverCapabilities.renameProvider)
      return Promise.reject(new Error("Server does not support rename"))
    this.sync(view)
    return this.mappedRequest("textDocument/rename", {
      newName,
      position: toPos(view.state.doc, pos),
      textDocument: {uri: editorURI(view)},
    })
  }

  signatureHelp(view: EditorView, pos: number, context: lsp.SignatureHelpContext) {
    if (!this.serverCapabilities.signatureHelpProvider) return Promise.resolve(null)
    this.sync(view)
    return this.request("textDocument/signatureHelp", {
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
