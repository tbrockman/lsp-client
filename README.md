<!-- NOTE: README.md is generated from src/README.md -->

# @codemirror/lsp-client [![NPM version](https://img.shields.io/npm/v/@codemirror/lsp-client.svg)](https://www.npmjs.org/package/@codemirror/lsp-client)

[ [**WEBSITE**](https://codemirror.net/) | [**ISSUES**](https://github.com/codemirror/dev/issues) | [**FORUM**](https://discuss.codemirror.net/c/v6/) | [**CHANGELOG**](https://github.com/codemirror/lsp-client/blob/main/CHANGELOG.md) ]

This package implements a language server protocol (LSP) client for
the [CodeMirror](https://codemirror.net/) code editor.

The [project page](https://codemirror.net/) has more information, a
number of [examples](https://codemirror.net/examples/) and the
[documentation](https://codemirror.net/docs/).

This code is released under an
[MIT license](https://github.com/codemirror/lsp-server/tree/main/LICENSE).

We aim to be an inclusive, welcoming community. To make that explicit,
we have a [code of
conduct](http://contributor-covenant.org/version/1/1/0/) that applies
to communication around the project.

## Usage

There are various ways to run a language server and connect it to a
web page. You can run it on the server and proxy it through a web
socket, or, if it is written in JavaScript or can be compiled to WASM,
run it directly in the client. The @codemirror/lsp-client package
talks to the server through a ([`Transport`](#lsp-client.Transport))
object, which exposes a small interface for sending and receiving JSON
messages.

Responsibility for how to actually talk to the server, how to connect
and to handle disconnects are left to the code that implements the
transport.

This example uses a crude transport that doesn't handle errors at all.


```javascript
import {Transport, LSPClient, languageServerSupport} from "@codemirror/lsp-client"
import {basicSetup, EditorView} from "codemirror"
import {typescriptLanguage} from "@codemirror/lang-javascript"

function simpleWebSocketTransport(uri: string): Promise<Transport> {
  let handlers: ((value: string) => void)[] = []
  let sock = new WebSocket(uri)
  sock.onmessage = e => { for (let h of handlers) h(e.data.toString()) }
  return new Promise(resolve => {
    sock.onopen = () => resolve({
      send(message: string) { sock.send(message) },
      subscribe(handler: (value: string) => void) { handlers.push(handler) },
      unsubscribe(handler: (value: string) => void) { handlers = handlers.filter(h => h != handler) }
    })
  })
}

let transport = await simpleWebSocketTransport("ws://host:port")
let client = new LSPClient().connect(transport)

new EditorView({
  extensions: [
    basicSetup,
    typescriptLanguage,
    languageServerSupport(client, "file:///some/file.ts"),
  ],
  parent: document.body
})
```

## API Reference

### Client

<dl>
<dt id="user-content-lspclient">
  <h4>
    <code>class</code>
    <a href="#user-content-lspclient">LSPClient</a></h4>
</dt>

<dd><p>An LSP client manages a connection to a language server. It should
be explicitly <a href="#user-content-lspclient.connect">connected</a> before
use.</p>
<dl><dt id="user-content-lspclient.constructor">
  <code>new <strong><a href="#user-content-lspclient.constructor">LSPClient</a></strong>(<a id="user-content-lspclient.constructor^config" href="#user-content-lspclient.constructor^config">config</a>&#8288;?: <a href="#user-content-lspclientconfig">LSPClientConfig</a> = {})</code></dt>

<dd><p>Create a client object.</p>
</dd><dt id="user-content-lspclient.transport">
  <code><strong><a href="#user-content-lspclient.transport">transport</a></strong>: <a href="#user-content-transport">Transport</a> | <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/null">null</a></code></dt>

<dd><p>The transport active in the client, if it is connected.</p>
</dd><dt id="user-content-lspclient.servercapabilities">
  <code><strong><a href="#user-content-lspclient.servercapabilities">serverCapabilities</a></strong>: <a href="https://microsoft.github.io/language-server-protocol/specifications/specification-current#serverCapabilities">ServerCapabilities</a> | <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/null">null</a></code></dt>

<dd><p>The capabilities advertised by the server. Will be null when not
connected or initialized.</p>
</dd><dt id="user-content-lspclient.initializing">
  <code><strong><a href="#user-content-lspclient.initializing">initializing</a></strong>: <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise">Promise</a>&lt;<a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/null">null</a>&gt;</code></dt>

<dd><p>A promise that resolves once the client connection is initialized. Will be
replaced by a new promise object when you call <code>disconnect</code>.</p>
</dd><dt id="user-content-lspclient.config">
  <code><strong><a href="#user-content-lspclient.config">config</a></strong>: <a href="#user-content-lspclientconfig">LSPClientConfig</a></code></dt>

<dd></dd><dt id="user-content-lspclient.connect">
  <code><strong><a href="#user-content-lspclient.connect">connect</a></strong>(<a id="user-content-lspclient.connect^transport" href="#user-content-lspclient.connect^transport">transport</a>: <a href="#user-content-transport">Transport</a>) → <a href="#user-content-lspclient">LSPClient</a></code></dt>

<dd><p>Connect this client to a server over the given transport. Will
immediately start the initialization exchange with the server,
and resolve <code>this.initializing</code> (which it also returns) when
successful.</p>
</dd><dt id="user-content-lspclient.disconnect">
  <code><strong><a href="#user-content-lspclient.disconnect">disconnect</a></strong>()</code></dt>

<dd><p>Disconnect the client from the server.</p>
</dd><dt id="user-content-lspclient.request">
  <code><strong><a href="#user-content-lspclient.request">request</a></strong>&lt;<a id="user-content-lspclient.request^params" href="#user-content-lspclient.request^params">Params</a>, <a id="user-content-lspclient.request^result" href="#user-content-lspclient.request^result">Result</a>&gt;(<a id="user-content-lspclient.request^method" href="#user-content-lspclient.request^method">method</a>: <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String">string</a>, <a id="user-content-lspclient.request^params" href="#user-content-lspclient.request^params">params</a>: <a href="#user-content-lspclient.request^params">Params</a>) → <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise">Promise</a>&lt;<a href="#user-content-lspclient.request^result">Result</a>&gt;</code></dt>

<dd><p>Make a request to the server. Returns a promise that resolves to
the response or rejects with a failure message. You'll probably
want to use types from the <code>vscode-languageserver-protocol</code>
package for the type parameters.</p>
<p>The caller is responsible for
<a href="#user-content-lspclient.sync">synchronizing</a> state before the
request and correctly handling state drift caused by local
changes that happend during the request.</p>
</dd><dt id="user-content-lspclient.mappedrequest">
  <code><strong><a href="#user-content-lspclient.mappedrequest">mappedRequest</a></strong>&lt;<a id="user-content-lspclient.mappedrequest^params" href="#user-content-lspclient.mappedrequest^params">Params</a>, <a id="user-content-lspclient.mappedrequest^result" href="#user-content-lspclient.mappedrequest^result">Result</a>&gt;(<a id="user-content-lspclient.mappedrequest^method" href="#user-content-lspclient.mappedrequest^method">method</a>: <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String">string</a>, <a id="user-content-lspclient.mappedrequest^params" href="#user-content-lspclient.mappedrequest^params">params</a>: <a href="#user-content-lspclient.mappedrequest^params">Params</a>) → <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise">Promise</a>&lt;{response: <a href="#user-content-lspclient.mappedrequest^result">Result</a>}&gt;</code></dt>

<dd><p>Make a request that tracks local changes that happen during the
request. The returned promise resolves to both a response and an
object that tells you about document changes that happened
during the request.</p>
</dd><dt id="user-content-lspclient.notification">
  <code><strong><a href="#user-content-lspclient.notification">notification</a></strong>&lt;<a id="user-content-lspclient.notification^params" href="#user-content-lspclient.notification^params">Params</a>&gt;(<a id="user-content-lspclient.notification^method" href="#user-content-lspclient.notification^method">method</a>: <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String">string</a>, <a id="user-content-lspclient.notification^params" href="#user-content-lspclient.notification^params">params</a>: <a href="#user-content-lspclient.notification^params">Params</a>)</code></dt>

<dd><p>Send a notification to the server.</p>
</dd><dt id="user-content-lspclient.cancelrequest">
  <code><strong><a href="#user-content-lspclient.cancelrequest">cancelRequest</a></strong>(<a id="user-content-lspclient.cancelrequest^params" href="#user-content-lspclient.cancelrequest^params">params</a>: any)</code></dt>

<dd><p>Cancel the in-progress request with the given parameter value
(which is compared by identity).</p>
</dd><dt id="user-content-lspclient.hascapability">
  <code><strong><a href="#user-content-lspclient.hascapability">hasCapability</a></strong>(<a id="user-content-lspclient.hascapability^name" href="#user-content-lspclient.hascapability^name">name</a>: &quot;positionEncoding&quot; | &quot;textDocumentSync&quot; | &quot;notebookDocumentSync&quot; | &quot;completionProvider&quot; | &quot;hoverProvider&quot; | &quot;signatureHelpProvider&quot; | &quot;declarationProvider&quot; | &quot;definitionProvider&quot; | &quot;typeDefinitionProvider&quot; | &quot;implementationProvider&quot; | &quot;referencesProvider&quot; | &quot;documentHighlightProvider&quot; | &quot;documentSymbolProvider&quot; | &quot;codeActionProvider&quot; | &quot;codeLensProvider&quot; | &quot;documentLinkProvider&quot; | &quot;colorProvider&quot; | &quot;workspaceSymbolProvider&quot; | &quot;documentFormattingProvider&quot; | &quot;documentRangeFormattingProvider&quot; | &quot;documentOnTypeFormattingProvider&quot; | &quot;renameProvider&quot; | &quot;foldingRangeProvider&quot; | &quot;selectionRangeProvider&quot; | &quot;executeCommandProvider&quot; | &quot;callHierarchyProvider&quot; | &quot;linkedEditingRangeProvider&quot; | &quot;semanticTokensProvider&quot; | &quot;monikerProvider&quot; | &quot;typeHierarchyProvider&quot; | &quot;inlineValueProvider&quot; | &quot;inlayHintProvider&quot; | &quot;diagnosticProvider&quot; | &quot;inlineCompletionProvider&quot; | &quot;workspace&quot; | &quot;experimental&quot;) → <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean">boolean</a> | <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/null">null</a></code></dt>

<dd><p>Check whether the server has a given property in its capability
object. Returns null when the connection hasn't finished
initializing yet.</p>
</dd></dl>

</dd>
<dt id="user-content-lspclientconfig">
  <h4>
    <code>type</code>
    <a href="#user-content-lspclientconfig">LSPClientConfig</a></h4>
</dt>

<dd><p>Configuration options that can be passed to the LSP client.</p>
<dl><dt id="user-content-lspclientconfig.rooturi">
  <code><strong><a href="#user-content-lspclientconfig.rooturi">rootUri</a></strong>&#8288;?: <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String">string</a></code></dt>

<dd><p>The project root URI passed to the server, when necessary.</p>
</dd><dt id="user-content-lspclientconfig.timeout">
  <code><strong><a href="#user-content-lspclientconfig.timeout">timeout</a></strong>&#8288;?: <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number">number</a></code></dt>

<dd><p>The amount of milliseconds after which requests are
automatically timed out. Defaults to 3000.</p>
</dd><dt id="user-content-lspclientconfig.sanitizehtml">
  <code><strong><a href="#user-content-lspclientconfig.sanitizehtml">sanitizeHTML</a></strong>&#8288;?: fn(<a id="user-content-lspclientconfig.sanitizehtml^html" href="#user-content-lspclientconfig.sanitizehtml^html">html</a>: <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String">string</a>) → <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String">string</a></code></dt>

<dd><p>LSP servers can send Markdown code, which the client must render
and display as HTML. Markdown can contain arbitrary HTML and is
thus a potential channel for cross-site scripting attacks, if
someone is able to compromise your LSP server or your connection
to it. You can pass an HTML sanitizer here to strip out
suspicious HTML structure.</p>
</dd><dt id="user-content-lspclientconfig.highlightlanguage">
  <code><strong><a href="#user-content-lspclientconfig.highlightlanguage">highlightLanguage</a></strong>&#8288;?: fn(<a id="user-content-lspclientconfig.highlightlanguage^name" href="#user-content-lspclientconfig.highlightlanguage^name">name</a>: <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String">string</a>) → <a href="https://codemirror.net/docs/ref#language.Language">Language</a> | <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/null">null</a></code></dt>

<dd><p>By default, the Markdown renderer will only be able to highlght
code embedded in the Markdown text when its language tag matches
the name of the language used by the editor. You can provide a
function here that returns a CodeMirror language object for a
given language tag to support morelanguages.</p>
</dd><dt id="user-content-lspclientconfig.handlechangeinfile">
  <code><strong><a href="#user-content-lspclientconfig.handlechangeinfile">handleChangeInFile</a></strong>&#8288;?: fn(<a id="user-content-lspclientconfig.handlechangeinfile^uri" href="#user-content-lspclientconfig.handlechangeinfile^uri">uri</a>: <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String">string</a>, <a id="user-content-lspclientconfig.handlechangeinfile^changes" href="#user-content-lspclientconfig.handlechangeinfile^changes">changes</a>: <a href="https://microsoft.github.io/language-server-protocol/specifications/specification-current#textEdit">TextEdit</a>[]) → <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean">boolean</a></code></dt>

<dd><p>Some actions, like symbol rename, can cause the server to return
changes in files other than the one the active editor has open.
When this happens, the client will try to call this handler,
when given, to process such changes. If it is not provided, or
it returns false, and another editor view has the given URI
open, the changes will be dispatched to the other editor.</p>
</dd><dt id="user-content-lspclientconfig.notificationhandlers">
  <code><strong><a href="#user-content-lspclientconfig.notificationhandlers">notificationHandlers</a></strong>&#8288;?: <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object">Object</a>&lt;fn(<a id="user-content-lspclientconfig.notificationhandlers^client" href="#user-content-lspclientconfig.notificationhandlers^client">client</a>: <a href="#user-content-lspclient">LSPClient</a>, <a id="user-content-lspclientconfig.notificationhandlers^params" href="#user-content-lspclientconfig.notificationhandlers^params">params</a>: any) → <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean">boolean</a>&gt;</code></dt>

<dd><p>By default, the client will only handle the server notifications
<code>window/logMessage</code> (logging warning and errors to the console)
and <code>window/showMessage</code>. You can pass additional handlers here.
They will be tried before the built-in handlers, and override
those when they return true.</p>
</dd><dt id="user-content-lspclientconfig.unhandlednotification">
  <code><strong><a href="#user-content-lspclientconfig.unhandlednotification">unhandledNotification</a></strong>&#8288;?: fn(<a id="user-content-lspclientconfig.unhandlednotification^client" href="#user-content-lspclientconfig.unhandlednotification^client">client</a>: <a href="#user-content-lspclient">LSPClient</a>, <a id="user-content-lspclientconfig.unhandlednotification^method" href="#user-content-lspclientconfig.unhandlednotification^method">method</a>: <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String">string</a>, <a id="user-content-lspclientconfig.unhandlednotification^params" href="#user-content-lspclientconfig.unhandlednotification^params">params</a>: any)</code></dt>

<dd><p>When no handler is found for a notification, it will be passed
to this function, if given.</p>
</dd></dl>

</dd>
<dt id="user-content-transport">
  <h4>
    <code>type</code>
    <a href="#user-content-transport">Transport</a></h4>
</dt>

<dd><p>An object of this type should be used to wrap whatever transport
layer you use to talk to your language server. Messages should
contain only the JSON messages, no LSP headers.</p>
<dl><dt id="user-content-transport.send">
  <code><strong><a href="#user-content-transport.send">send</a></strong>(<a id="user-content-transport.send^message" href="#user-content-transport.send^message">message</a>: <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String">string</a>)</code></dt>

<dd><p>Send a message to the server. Should throw if the connection is
broken somehow.</p>
</dd><dt id="user-content-transport.subscribe">
  <code><strong><a href="#user-content-transport.subscribe">subscribe</a></strong>(<a id="user-content-transport.subscribe^handler" href="#user-content-transport.subscribe^handler">handler</a>: fn(<a id="user-content-transport.subscribe^handler^value" href="#user-content-transport.subscribe^handler^value">value</a>: <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String">string</a>))</code></dt>

<dd><p>Register a handler for messages coming from the server.</p>
</dd><dt id="user-content-transport.unsubscribe">
  <code><strong><a href="#user-content-transport.unsubscribe">unsubscribe</a></strong>(<a id="user-content-transport.unsubscribe^handler" href="#user-content-transport.unsubscribe^handler">handler</a>: fn(<a id="user-content-transport.unsubscribe^handler^value" href="#user-content-transport.unsubscribe^handler^value">value</a>: <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String">string</a>))</code></dt>

<dd><p>Unregister a handler registered with <code>subscribe</code>.</p>
</dd></dl>

</dd>
<dt id="user-content-lspplugin">
  <h4>
    <code>class</code>
    <a href="#user-content-lspplugin">LSPPlugin</a></h4>
</dt>

<dd><p>A plugin that connects a given editor to a language server client.</p>
<dl><dt id="user-content-lspplugin.client">
  <code><strong><a href="#user-content-lspplugin.client">client</a></strong>: <a href="#user-content-lspclient">LSPClient</a></code></dt>

<dd><p>The client connection.</p>
</dd><dt id="user-content-lspplugin.uri">
  <code><strong><a href="#user-content-lspplugin.uri">uri</a></strong>: <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String">string</a></code></dt>

<dd><p>The URI of this file.</p>
</dd><dt id="user-content-lspplugin.view">
  <code><strong><a href="#user-content-lspplugin.view">view</a></strong>: <a href="https://codemirror.net/docs/ref#view.EditorView">EditorView</a></code></dt>

<dd></dd><dt id="user-content-lspplugin.sync">
  <code><strong><a href="#user-content-lspplugin.sync">sync</a></strong>()</code></dt>

<dd><p>Notify the server of any local changes that have been made to
open documents. You'll want to call this before most types of
requests, to make sure the server isn't working with outdated
information.</p>
</dd><dt id="user-content-lspplugin.doctohtml">
  <code><strong><a href="#user-content-lspplugin.doctohtml">docToHTML</a></strong>(<a id="user-content-lspplugin.doctohtml^value" href="#user-content-lspplugin.doctohtml^value">value</a>: <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String">string</a> | <a href="https://microsoft.github.io/language-server-protocol/specifications/specification-current#markupContent">MarkupContent</a>, <a id="user-content-lspplugin.doctohtml^defaultkind" href="#user-content-lspplugin.doctohtml^defaultkind">defaultKind</a>&#8288;?: <a href="https://microsoft.github.io/language-server-protocol/specifications/specification-current#markupKind">MarkupKind</a> = &quot;plaintext&quot;) → <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String">string</a></code></dt>

<dd><p>Render a doc string from the server to HTML.</p>
</dd><dt id="user-content-lspplugin.toposition">
  <code><strong><a href="#user-content-lspplugin.toposition">toPosition</a></strong>(<a id="user-content-lspplugin.toposition^pos" href="#user-content-lspplugin.toposition^pos">pos</a>: <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number">number</a>, <a id="user-content-lspplugin.toposition^doc" href="#user-content-lspplugin.toposition^doc">doc</a>&#8288;?: <a href="https://codemirror.net/docs/ref#state.Text">Text</a> = this.view.state.doc) → <a href="https://microsoft.github.io/language-server-protocol/specifications/specification-current#position">Position</a></code></dt>

<dd><p>Convert a CodeMirror document offset into an LSP <code>{line, character}</code> object. Defaults to using the view's current
document, but can be given another one.</p>
</dd><dt id="user-content-lspplugin.fromposition">
  <code><strong><a href="#user-content-lspplugin.fromposition">fromPosition</a></strong>(<a id="user-content-lspplugin.fromposition^pos" href="#user-content-lspplugin.fromposition^pos">pos</a>: <a href="https://microsoft.github.io/language-server-protocol/specifications/specification-current#position">Position</a>, <a id="user-content-lspplugin.fromposition^doc" href="#user-content-lspplugin.fromposition^doc">doc</a>&#8288;?: <a href="https://codemirror.net/docs/ref#state.Text">Text</a> = this.view.state.doc) → <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number">number</a></code></dt>

<dd><p>Convert an LSP <code>{line, character}</code> object to a CodeMirror
document offset.</p>
</dd><dt id="user-content-lspplugin.reporterror">
  <code><strong><a href="#user-content-lspplugin.reporterror">reportError</a></strong>(<a id="user-content-lspplugin.reporterror^message" href="#user-content-lspplugin.reporterror^message">message</a>: any, <a id="user-content-lspplugin.reporterror^err" href="#user-content-lspplugin.reporterror^err">err</a>: any)</code></dt>

<dd></dd><dt id="user-content-lspplugin^get">
  <code>static <strong><a href="#user-content-lspplugin^get">get</a></strong>(<a id="user-content-lspplugin^get^view" href="#user-content-lspplugin^get^view">view</a>: <a href="https://codemirror.net/docs/ref#view.EditorView">EditorView</a>) → <a href="#user-content-lspplugin">LSPPlugin</a> | <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/null">null</a></code></dt>

<dd><p>Get the LSP plugin associated with an editor, if any.</p>
</dd><dt id="user-content-lspplugin^create">
  <code>static <strong><a href="#user-content-lspplugin^create">create</a></strong>(<a id="user-content-lspplugin^create^client" href="#user-content-lspplugin^create^client">client</a>: <a href="#user-content-lspclient">LSPClient</a>, <a id="user-content-lspplugin^create^fileuri" href="#user-content-lspplugin^create^fileuri">fileURI</a>: <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String">string</a>, <a id="user-content-lspplugin^create^languageid" href="#user-content-lspplugin^create^languageid">languageID</a>&#8288;?: <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String">string</a>) → <a href="https://codemirror.net/docs/ref#state.Extension">Extension</a></code></dt>

<dd><p>Create an editor extension that connects that editor to the given
LSP client. This will cause the client to consider the given
URI/file to be open, and allow the editor to use LSP-related
functionality exported by this package.</p>
<p>By default, the language ID given to the server for this file is
derived from the editor's language configuration via
<a href="https://codemirror.net/docs/ref/#language.Language.name"><code>Language.name</code></a>. You can pass in
a specific ID as a third parameter.</p>
</dd></dl>

</dd>
</dl>
<h2>Extensions</h2>
<dl>
<dt id="user-content-languageserversupport">
  <code><strong><a href="#user-content-languageserversupport">languageServerSupport</a></strong>(<a id="user-content-languageserversupport^client" href="#user-content-languageserversupport^client">client</a>: <a href="#user-content-lspclient">LSPClient</a>, <a id="user-content-languageserversupport^uri" href="#user-content-languageserversupport^uri">uri</a>: <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String">string</a>, <a id="user-content-languageserversupport^languageid" href="#user-content-languageserversupport^languageid">languageID</a>&#8288;?: <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String">string</a>) → <a href="https://codemirror.net/docs/ref#state.Extension">Extension</a></code></dt>

<dd><p>Returns an extension that enables the <a href="#user-content-lspplugin">LSP
plugin</a> and all other features provided by
this package. You also pick and choose individual extensions from
the exports. In that case, make sure to also include
<code>LSPPlugin.create</code> in your extensions, or the others will not
work.</p>
</dd>
<dt id="user-content-servercompletion">
  <code><strong><a href="#user-content-servercompletion">serverCompletion</a></strong>(<a id="user-content-servercompletion^config" href="#user-content-servercompletion^config">config</a>&#8288;?: <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object">Object</a> = {}) → <a href="https://codemirror.net/docs/ref#state.Extension">Extension</a></code></dt>

<dd><p>Register the <a href="#user-content-servercompletionsource">language server completion
source</a> as an autocompletion
source.</p>
<dl><dt id="user-content-servercompletion^config">
  <code><strong><a href="#user-content-servercompletion^config">config</a></strong></code></dt>

<dd><dl><dt id="user-content-servercompletion^config.override">
  <code><strong><a href="#user-content-servercompletion^config.override">override</a></strong>&#8288;?: <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean">boolean</a></code></dt>

<dd><p>By default, the completion source that asks the language server
for completions is added as a regular source, in addition to any
other sources. Set this to true to make it replace all
completion sources.</p>
</dd></dl></dd></dl></dd>
<dt id="user-content-hovertooltips">
  <code><strong><a href="#user-content-hovertooltips">hoverTooltips</a></strong>(<a id="user-content-hovertooltips^config" href="#user-content-hovertooltips^config">config</a>&#8288;?: {hoverTime&#8288;?: <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number">number</a>} = {}) → <a href="https://codemirror.net/docs/ref#state.Extension">Extension</a></code></dt>

<dd><p>Create an extension that queries the language server for hover
tooltips when the user hovers over the code with their pointer,
and displays a tooltip when the server provides one.</p>
</dd>
<dt id="user-content-formatdocument">
  <code><strong><a href="#user-content-formatdocument">formatDocument</a></strong>: <a href="https://codemirror.net/docs/ref#view.Command">Command</a></code></dt>

<dd><p>This command asks the language server to reformat the document,
and then applies the changes it returns.</p>
</dd>
<dt id="user-content-formatkeymap">
  <code><strong><a href="#user-content-formatkeymap">formatKeymap</a></strong>: readonly <a href="https://codemirror.net/docs/ref#view.KeyBinding">KeyBinding</a>[]</code></dt>

<dd><p>A keymap that binds Shift-Alt-f to
<a href="#user-content-lsp-server.formatdocument"><code>formatDocument</code></a>.</p>
</dd>
<dt id="user-content-renamesymbol">
  <code><strong><a href="#user-content-renamesymbol">renameSymbol</a></strong>: <a href="https://codemirror.net/docs/ref#view.Command">Command</a></code></dt>

<dd><p>This command will, if the cursor is over a word, prompt the user
for a new name for that symbol, and ask the language server to
perform a rename of that symbol.</p>
<p>Note that this may affect files other than the one loaded into
this view. See the
<a href="#user-content-lspclientconfig.handlechangeinfile"><code>handleChangeInFile</code></a>
option.</p>
</dd>
<dt id="user-content-renamekeymap">
  <code><strong><a href="#user-content-renamekeymap">renameKeymap</a></strong>: readonly <a href="https://codemirror.net/docs/ref#view.KeyBinding">KeyBinding</a>[]</code></dt>

<dd><p>A keymap that binds F2 to <a href="#user-content-lsp-server.renamesymbol"><code>renameSymbol</code></a>.</p>
</dd>
<dt id="user-content-signaturehelp">
  <code><strong><a href="#user-content-signaturehelp">signatureHelp</a></strong>(<a id="user-content-signaturehelp^config" href="#user-content-signaturehelp^config">config</a>&#8288;?: {keymap&#8288;?: <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean">boolean</a>} = {}) → <a href="https://codemirror.net/docs/ref#state.Extension">Extension</a></code></dt>

<dd><p>Returns an extension that enables signature help. Will bind the
keys in <a href="#user-content-signaturekeymap"><code>signatureKeymap</code></a> unless
<code>keymap</code> is set to <code>false</code>.</p>
</dd>
<dt id="user-content-showsignaturehelp">
  <code><strong><a href="#user-content-showsignaturehelp">showSignatureHelp</a></strong>: <a href="https://codemirror.net/docs/ref#view.Command">Command</a></code></dt>

<dd><p>Explicitly prompt the server to provide signature help at the
cursor.</p>
</dd>
<dt id="user-content-nextsignature">
  <code><strong><a href="#user-content-nextsignature">nextSignature</a></strong>: <a href="https://codemirror.net/docs/ref#view.Command">Command</a></code></dt>

<dd><p>If there is an active signature tooltip with multiple signatures,
move to the next one.</p>
</dd>
<dt id="user-content-prevsignature">
  <code><strong><a href="#user-content-prevsignature">prevSignature</a></strong>: <a href="https://codemirror.net/docs/ref#view.Command">Command</a></code></dt>

<dd><p>If there is an active signature tooltip with multiple signatures,
move to the previous signature.</p>
</dd>
</dl>
