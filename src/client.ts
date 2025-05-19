import type * as lsp from "vscode-languageserver-protocol"
import {EditorView} from "@codemirror/view"
import {ChangeSet, ChangeDesc, MapMode, Extension} from "@codemirror/state"
import {lspPlugin, FileState} from "./plugin.js"
import {toPos} from "./pos.js"
import {type LSPFeature} from "./feature"

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
      let file = client.openFiles.get(uri)
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

  // FIXME more utility functions
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

export class LSPClient {
  transport: Transport | null = null
  nextID = 0
  requests: Request<any>[] = []
  openFiles: Map<string, OpenFile> = new Map
  serverCapabilities: lsp.ServerCapabilities | null = null
  initializing: Promise<null>
  declare initialized: () => void

  constructor() {
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
      capabilities: {
        textDocument: {
          completion: {
            completionItem: {
              snippetSupport: true, // FIXME
              documentationFormat: ["plaintext", "markdown"], // FIXME
              insertReplaceSupport: true, // FIXME
              
            },
            completionList: {
              itemDefaults: ["commitCharacters", "editRange", "insertTextFormat"]
            },
            completionItemKind: {valueSet: []},
            contextSupport: true,
          }
        },
      }
    }).promise.then(resp => {
      this.serverCapabilities = resp.capabilities
      this.notification("initialized", {})
      this.initialized()
    })
    for (let file of this.openFiles.values()) {
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
    this.serverCapabilities = null
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

  async request<Method extends keyof Requests>(method: Method, params: Requests[Method][0]): Promise<Requests[Method][1]> {
    await this.initializing
    return this.requestInner(method, params).promise
  }

  async mappedRequest<Method extends keyof Requests>(method: Method, params: Requests[Method][0]): Promise<{
    response: Requests[Method][1],
    mapping: WorkspaceMapping
  }> {
    await this.initializing
    let req = this.requestInner(method, params, true)
    req.mapBase = [... this.openFiles.values()].map(f => ({uri: f.uri, version: f.version}))
    return req.promise.then(response => {
      let mapping = new WorkspaceMapping(this, req.mapBase!)
      this.cleanMapping()
      return {response, mapping}
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
    let found = this.openFiles.get(uri)
    if (!found) {
      found = new OpenFile(uri, languageId)
      this.notification("textDocument/didOpen", {
        textDocument: {
          uri,
          languageId,
          text: view.state.doc.toString(),
          version: found.version
        }
      })
      this.openFiles.set(uri, found)
    }
    found.using.unshift(view)
    return found.version
  }

  unregisterUser(uri: string, view: EditorView) {
    let open = this.openFiles.get(uri)
    if (!open) return
    let idx = open.using.indexOf(view)
    if (idx < 0) return
    open.using.splice(idx, 1)
    if (!open.using.length) {
      this.notification("textDocument/didClose", {textDocument: {uri}})
      this.openFiles.delete(uri)
    }
  }

  mainEditor(uri: string, active?: EditorView) {
    let open = this.openFiles.get(uri)
    if (!open) return null
    if (active && open.using.indexOf(active) > -1) return active
    return open.using[0]
  }

  sync(editor?: EditorView) {
    for (let file of this.openFiles.values()) {
      let main = this.mainEditor(file.uri, editor)!
      let plugin = main.plugin(lspPlugin)
      if (!plugin) continue
      if (!plugin.fileState.changes.empty || plugin.fileState.syncedVersion != file.version) {
        file.version++
        if (this.requests.some(r => r.mapBase)) file.history.push(plugin.fileState)
        plugin.fileState = new FileState(file.version, ChangeSet.empty(main.state.doc.length))
        this.notification("textDocument/didChange", {
          textDocument: {uri: file.uri, version: file.version},
          contentChanges: [{text: main.state.doc.toString()}] // FIXME incremental updates
        })
      }
    }
  }

  cleanMapping() {
    let oldest: Map<string, number> = new Map
    for (let req of this.requests) if (req.mapBase) {
      for (let {uri, version} of req.mapBase) {
        let cur = oldest.get(uri)
        oldest.set(uri, cur == null ? version : Math.min(version, cur))
      }
    }
    if (oldest.size) for (let file of this.openFiles.values()) {
      let minVer = oldest.get(file.uri)
      if (file.history.length) file.history = minVer == null ? [] : file.history.filter(s => s.syncedVersion >= minVer!)
    }
  }

  completions(view: EditorView, pos: number, explicit: boolean) {
    // FIXME check server capabilities
    this.sync(view)
    let uri = view.plugin(lspPlugin)!.uri
    return this.request("textDocument/completion", {
      position: toPos(view.state, pos),
      textDocument: {uri},
      context: {triggerKind: explicit ? 1 : 2}
    })
  }

  editorExtension(uri: string, features: LSPFeature = []): Extension {
    let extensions: Extension[] = [lspPlugin.of({client: this, uri})]
    let walk = (feature: LSPFeature) => {
      if (Array.isArray(feature)) feature.forEach(walk)
      else extensions.push(feature.extension(this))
    }
    walk(features)
    return extensions
  }
}
