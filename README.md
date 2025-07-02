<!-- NOTE: README.md is generated from src/README.md -->

# @codemirror/lsp-client [![NPM version](https://img.shields.io/npm/v/@codemirror/lsp-client.svg)](https://www.npmjs.org/package/@codemirror/lsp-client)

[ [**WEBSITE**](https://codemirror.net/) | [**ISSUES**](https://github.com/codemirror/dev/issues) | [**FORUM**](https://discuss.codemirror.net/c/v6/) | [**CHANGELOG**](https://github.com/codemirror/lsp-client/blob/main/CHANGELOG.md) ]

This package implements a language server protocol (LSP) client for
the [CodeMirror](https://codemirror.net/) code editor.

The [project page](https://codemirror.net/) has more information, a
number of [examples](https://codemirror.net/examples/) and the
[documentation](https://codemirror.net/docs/).

Note that this code **does not** have a license yet. That should soon
change.

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
</dd><dt id="user-content-lspclient.workspace">
  <code><strong><a href="#user-content-lspclient.workspace">workspace</a></strong>: <a href="#user-content-workspace">Workspace</a></code></dt>

<dd><p>The client's <a href="#user-content-workspace">workspace</a>.</p>
</dd><dt id="user-content-lspclient.servercapabilities">
  <code><strong><a href="#user-content-lspclient.servercapabilities">serverCapabilities</a></strong>: <a href="https://microsoft.github.io/language-server-protocol/specifications/specification-current#serverCapabilities">ServerCapabilities</a> | <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/null">null</a></code></dt>

<dd><p>The capabilities advertised by the server. Will be null when not
connected or initialized.</p>
</dd><dt id="user-content-lspclient.initializing">
  <code><strong><a href="#user-content-lspclient.initializing">initializing</a></strong>: <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise">Promise</a>&lt;<a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/null">null</a>&gt;</code></dt>

<dd><p>A promise that resolves once the client connection is initialized. Will be
replaced by a new promise object when you call <code>disconnect</code>.</p>
</dd><dt id="user-content-lspclient.connected">
  <code><strong><a href="#user-content-lspclient.connected">connected</a></strong>: <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean">boolean</a></code></dt>

<dd><p>Whether this client is connected (has a transport).</p>
</dd><dt id="user-content-lspclient.connect">
  <code><strong><a href="#user-content-lspclient.connect">connect</a></strong>(<a id="user-content-lspclient.connect^transport" href="#user-content-lspclient.connect^transport">transport</a>: <a href="#user-content-transport">Transport</a>) → <a href="#user-content-lspclient">LSPClient</a></code></dt>

<dd><p>Connect this client to a server over the given transport. Will
immediately start the initialization exchange with the server,
and resolve <code>this.initializing</code> (which it also returns) when
successful.</p>
</dd><dt id="user-content-lspclient.disconnect">
  <code><strong><a href="#user-content-lspclient.disconnect">disconnect</a></strong>()</code></dt>

<dd><p>Disconnect the client from the server.</p>
</dd><dt id="user-content-lspclient.didopen">
  <code><strong><a href="#user-content-lspclient.didopen">didOpen</a></strong>(<a id="user-content-lspclient.didopen^file" href="#user-content-lspclient.didopen^file">file</a>: <a href="#user-content-workspacefile">WorkspaceFile</a>)</code></dt>

<dd><p>Send a <code>textDocument/didOpen</code> notification to the server.</p>
</dd><dt id="user-content-lspclient.didclose">
  <code><strong><a href="#user-content-lspclient.didclose">didClose</a></strong>(<a id="user-content-lspclient.didclose^uri" href="#user-content-lspclient.didclose^uri">uri</a>: <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String">string</a>)</code></dt>

<dd><p>Send a <code>textDocument/didClose</code> notification to the server.</p>
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
</dd><dt id="user-content-lspclient.notification">
  <code><strong><a href="#user-content-lspclient.notification">notification</a></strong>&lt;<a id="user-content-lspclient.notification^params" href="#user-content-lspclient.notification^params">Params</a>&gt;(<a id="user-content-lspclient.notification^method" href="#user-content-lspclient.notification^method">method</a>: <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String">string</a>, <a id="user-content-lspclient.notification^params" href="#user-content-lspclient.notification^params">params</a>: <a href="#user-content-lspclient.notification^params">Params</a>)</code></dt>

<dd><p>Send a notification to the server.</p>
</dd><dt id="user-content-lspclient.cancelrequest">
  <code><strong><a href="#user-content-lspclient.cancelrequest">cancelRequest</a></strong>(<a id="user-content-lspclient.cancelrequest^params" href="#user-content-lspclient.cancelrequest^params">params</a>: any)</code></dt>

<dd><p>Cancel the in-progress request with the given parameter value
(which is compared by identity).</p>
</dd><dt id="user-content-lspclient.workspacemapping">
  <code><strong><a href="#user-content-lspclient.workspacemapping">workspaceMapping</a></strong>() → <a href="#user-content-workspacemapping">WorkspaceMapping</a></code></dt>

<dd><p>Create a <a href="#user-content-workspacemapping">workspace mapping</a> that
tracks changes to files in this client's workspace, relative to
the moment where it was created. Make sure you call
<a href="#user-content-workspacemapping.destroy"><code>destroy</code></a> on the mapping
when you're done with it.</p>
</dd><dt id="user-content-lspclient.withmapping">
  <code><strong><a href="#user-content-lspclient.withmapping">withMapping</a></strong>&lt;<a id="user-content-lspclient.withmapping^t" href="#user-content-lspclient.withmapping^t">T</a>&gt;(<a id="user-content-lspclient.withmapping^f" href="#user-content-lspclient.withmapping^f">f</a>: fn(<a id="user-content-lspclient.withmapping^f^mapping" href="#user-content-lspclient.withmapping^f^mapping">mapping</a>: <a href="#user-content-workspacemapping">WorkspaceMapping</a>) → <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise">Promise</a>&lt;<a href="#user-content-lspclient.withmapping^t">T</a>&gt;) → <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise">Promise</a>&lt;<a href="#user-content-lspclient.withmapping^t">T</a>&gt;</code></dt>

<dd><p>Run the given promise with a <a href="#user-content-workspacemapping">workspace
mapping</a> active. Automatically
release the mapping when the promise resolves or rejects.</p>
</dd><dt id="user-content-lspclient.sync">
  <code><strong><a href="#user-content-lspclient.sync">sync</a></strong>()</code></dt>

<dd><p>Push any <a href="#user-content-workspace.syncfiles">pending changes</a> in
the open files to the server. You'll want to call this before
most types of requests, to make sure the server isn't working
with outdated information.</p>
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
</dd><dt id="user-content-lspclientconfig.workspace">
  <code><strong><a href="#user-content-lspclientconfig.workspace">workspace</a></strong>&#8288;?: fn(<a id="user-content-lspclientconfig.workspace^client" href="#user-content-lspclientconfig.workspace^client">client</a>: <a href="#user-content-lspclient">LSPClient</a>) → <a href="#user-content-workspace">Workspace</a></code></dt>

<dd><p>An optional function to create a
<a href="#user-content-workspace">workspace</a> object for the client to use.
When not given, this will default to a simple workspace that
only opens files that have an active editor, and only allows one
editor per file.</p>
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
given language tag to support more languages.</p>
</dd><dt id="user-content-lspclientconfig.notificationhandlers">
  <code><strong><a href="#user-content-lspclientconfig.notificationhandlers">notificationHandlers</a></strong>&#8288;?: <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object">Object</a>&lt;fn(<a id="user-content-lspclientconfig.notificationhandlers^client" href="#user-content-lspclientconfig.notificationhandlers^client">client</a>: <a href="#user-content-lspclient">LSPClient</a>, <a id="user-content-lspclientconfig.notificationhandlers^params" href="#user-content-lspclientconfig.notificationhandlers^params">params</a>: any) → <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean">boolean</a>&gt;</code></dt>

<dd><p>By default, the client will only handle the server notifications
<code>window/logMessage</code> (logging warnings and errors to the console)
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

<dd><p>The editor view that this plugin belongs to.</p>
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
  <code><strong><a href="#user-content-lspplugin.reporterror">reportError</a></strong>(<a id="user-content-lspplugin.reporterror^message" href="#user-content-lspplugin.reporterror^message">message</a>: <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String">string</a>, <a id="user-content-lspplugin.reporterror^err" href="#user-content-lspplugin.reporterror^err">err</a>: any)</code></dt>

<dd><p>Display an error in this plugin's editor.</p>
</dd><dt id="user-content-lspplugin.unsyncedchanges">
  <code><strong><a href="#user-content-lspplugin.unsyncedchanges">unsyncedChanges</a></strong>: <a href="https://codemirror.net/docs/ref#state.ChangeSet">ChangeSet</a></code></dt>

<dd><p>The changes accumulated in this editor that have not been sent
to the server yet.</p>
</dd><dt id="user-content-lspplugin.clear">
  <code><strong><a href="#user-content-lspplugin.clear">clear</a></strong>()</code></dt>

<dd><p>Reset the <a href="#user-content-lspplugin.unsyncedchanges">unsynced
changes</a>. Should probably
only be called by a <a href="#user-content-workspace">workspace</a>.</p>
</dd><dt id="user-content-lspplugin^get">
  <code>static <strong><a href="#user-content-lspplugin^get">get</a></strong>(<a id="user-content-lspplugin^get^view" href="#user-content-lspplugin^get^view">view</a>: <a href="https://codemirror.net/docs/ref#view.EditorView">EditorView</a>) → <a href="#user-content-lspplugin">LSPPlugin</a> | <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/null">null</a></code></dt>

<dd><p>Get the LSP plugin associated with an editor, if any.</p>
</dd><dt id="user-content-lspplugin^create">
  <code>static <strong><a href="#user-content-lspplugin^create">create</a></strong>(<a id="user-content-lspplugin^create^client" href="#user-content-lspplugin^create^client">client</a>: <a href="#user-content-lspclient">LSPClient</a>, <a id="user-content-lspplugin^create^fileuri" href="#user-content-lspplugin^create^fileuri">fileURI</a>: <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String">string</a>, <a id="user-content-lspplugin^create^languageid" href="#user-content-lspplugin^create^languageid">languageID</a>&#8288;?: <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String">string</a>) → <a href="https://codemirror.net/docs/ref#state.Extension">Extension</a></code></dt>

<dd><p>Create an editor extension that connects that editor to the
given LSP client. This extension is necessary to use LSP-related
functionality exported by this package. Creating an editor with
this plugin will cause
<a href="#user-content-workspace.openfile"><code>openFile</code></a> to be called on the
workspace.</p>
<p>By default, the language ID given to the server for this file is
derived from the editor's language configuration via
<a href="https://codemirror.net/docs/ref/#language.Language.name"><code>Language.name</code></a>. You can pass in
a specific ID as a third parameter.</p>
</dd></dl>

</dd>
<dt id="user-content-workspacemapping">
  <h4>
    <code>class</code>
    <a href="#user-content-workspacemapping">WorkspaceMapping</a></h4>
</dt>

<dd><p>A workspace mapping is used to track changes made to open
documents, so that positions returned by a request can be
interpreted in terms of the current, potentially changed document.</p>
<dl><dt id="user-content-workspacemapping.getmapping">
  <code><strong><a href="#user-content-workspacemapping.getmapping">getMapping</a></strong>(<a id="user-content-workspacemapping.getmapping^uri" href="#user-content-workspacemapping.getmapping^uri">uri</a>: <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String">string</a>) → <a href="https://codemirror.net/docs/ref#state.ChangeDesc">ChangeDesc</a> | <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/null">null</a></code></dt>

<dd><p>Get the changes made to the document with the given URI since
the mapping was created. Returns null for documents that aren't
open.</p>
</dd><dt id="user-content-workspacemapping.mappos">
  <code><strong><a href="#user-content-workspacemapping.mappos">mapPos</a></strong>(<a id="user-content-workspacemapping.mappos^uri" href="#user-content-workspacemapping.mappos^uri">uri</a>: <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String">string</a>, <a id="user-content-workspacemapping.mappos^pos" href="#user-content-workspacemapping.mappos^pos">pos</a>: <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number">number</a>, <a id="user-content-workspacemapping.mappos^assoc" href="#user-content-workspacemapping.mappos^assoc">assoc</a>&#8288;?: <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number">number</a>) → <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number">number</a></code><div><code><strong><a href="#user-content-workspacemapping.mappos">mapPos</a></strong>(<a id="user-content-workspacemapping.mappos^uri" href="#user-content-workspacemapping.mappos^uri">uri</a>: <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String">string</a>, <a id="user-content-workspacemapping.mappos^pos" href="#user-content-workspacemapping.mappos^pos">pos</a>: <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number">number</a>, <a id="user-content-workspacemapping.mappos^assoc" href="#user-content-workspacemapping.mappos^assoc">assoc</a>: <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number">number</a>, <a id="user-content-workspacemapping.mappos^mode" href="#user-content-workspacemapping.mappos^mode">mode</a>: <a href="https://codemirror.net/docs/ref#state.MapMode">MapMode</a>) → <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number">number</a> | <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/null">null</a></code></div></dt>

<dd><p>Map a position in the given file forward to the current document state.</p>
</dd><dt id="user-content-workspacemapping.mapposition">
  <code><strong><a href="#user-content-workspacemapping.mapposition">mapPosition</a></strong>(<a id="user-content-workspacemapping.mapposition^uri" href="#user-content-workspacemapping.mapposition^uri">uri</a>: <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String">string</a>, <a id="user-content-workspacemapping.mapposition^pos" href="#user-content-workspacemapping.mapposition^pos">pos</a>: <a href="https://microsoft.github.io/language-server-protocol/specifications/specification-current#position">Position</a>, <a id="user-content-workspacemapping.mapposition^assoc" href="#user-content-workspacemapping.mapposition^assoc">assoc</a>&#8288;?: <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number">number</a>) → <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number">number</a></code><div><code><strong><a href="#user-content-workspacemapping.mapposition">mapPosition</a></strong>(<a id="user-content-workspacemapping.mapposition^uri" href="#user-content-workspacemapping.mapposition^uri">uri</a>: <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String">string</a>, <a id="user-content-workspacemapping.mapposition^pos" href="#user-content-workspacemapping.mapposition^pos">pos</a>: <a href="https://microsoft.github.io/language-server-protocol/specifications/specification-current#position">Position</a>, <a id="user-content-workspacemapping.mapposition^assoc" href="#user-content-workspacemapping.mapposition^assoc">assoc</a>: <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number">number</a>, <a id="user-content-workspacemapping.mapposition^mode" href="#user-content-workspacemapping.mapposition^mode">mode</a>: <a href="https://codemirror.net/docs/ref#state.MapMode">MapMode</a>) → <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number">number</a> | <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/null">null</a></code></div></dt>

<dd><p>Convert an LSP-style position referring to a document at the
time the mapping was created to an offset in the current document.</p>
</dd><dt id="user-content-workspacemapping.destroy">
  <code><strong><a href="#user-content-workspacemapping.destroy">destroy</a></strong>()</code></dt>

<dd><p>Disconnect this mapping from the client so that it will no
longer be notified of new changes. You must make sure to call
this on every mapping you create, except when you use
<a href="#user-content-lspclient.withmapping"><code>withMapping</code></a>, which will
automatically schedule a disconnect when the given promise
resolves or aborts.</p>
</dd></dl>

</dd>
</dl>
<h3>Workspaces</h3>
<dl>
<dt id="user-content-workspace">
  <h4>
    <code>abstract class</code>
    <a href="#user-content-workspace">Workspace</a></h4>
</dt>

<dd><p>Implementing your own workspace class can provide more control
over the way files are loaded and managed when interacting with
the language server. See
<a href="#user-content-lspclientconfig.workspace"><code>LSPClientConfig.workspace</code></a>.</p>
<dl><dt id="user-content-workspace.constructor">
  <code>new <strong><a href="#user-content-workspace.constructor">Workspace</a></strong>(<a id="user-content-workspace.constructor^client" href="#user-content-workspace.constructor^client">client</a>: <a href="#user-content-lspclient">LSPClient</a>)</code></dt>

<dd><p>The constructor, as called by the client when creating a
workspace.</p>
</dd><dt id="user-content-workspace.files">
  <code>abstract <strong><a href="#user-content-workspace.files">files</a></strong>: <a href="#user-content-workspacefile">WorkspaceFile</a>[]</code></dt>

<dd><p>The files currently open in the workspace.</p>
</dd><dt id="user-content-workspace.client">
  <code><strong><a href="#user-content-workspace.client">client</a></strong>: <a href="#user-content-lspclient">LSPClient</a></code></dt>

<dd><p>The LSP client associated with this workspace.</p>
</dd><dt id="user-content-workspace.getfile">
  <code><strong><a href="#user-content-workspace.getfile">getFile</a></strong>(<a id="user-content-workspace.getfile^uri" href="#user-content-workspace.getfile^uri">uri</a>: <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String">string</a>) → <a href="#user-content-workspacefile">WorkspaceFile</a> | <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/null">null</a></code></dt>

<dd><p>Find the open file with the given URI, if it exists. The default
implementation just looks it up in <code>this.files</code>.</p>
</dd><dt id="user-content-workspace.syncfiles">
  <code>abstract <strong><a href="#user-content-workspace.syncfiles">syncFiles</a></strong>() → readonly {file: <a href="#user-content-workspacefile">WorkspaceFile</a>, prevDoc: <a href="https://codemirror.net/docs/ref#state.Text">Text</a>, changes: <a href="https://codemirror.net/docs/ref#state.ChangeSet">ChangeSet</a>}[]</code></dt>

<dd><p>Check all open files for changes (usually from editors, but they
may also come from other sources). When a file is changed,
return a record that describes the changes, and update the file's
<a href="#user-content-workspacefile.version"><code>version</code></a> and
<a href="#user-content-workspacefile.doc"><code>doc</code></a> properties to reflect the
new version.</p>
</dd><dt id="user-content-workspace.requestfile">
  <code><strong><a href="#user-content-workspace.requestfile">requestFile</a></strong>(<a id="user-content-workspace.requestfile^uri" href="#user-content-workspace.requestfile^uri">uri</a>: <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String">string</a>) → <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise">Promise</a>&lt;<a href="#user-content-workspacefile">WorkspaceFile</a> | <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/null">null</a>&gt;</code></dt>

<dd><p>Called to request that the workspace open a file. The default
implementation simply returns the file if it is open, null
otherwise.</p>
</dd><dt id="user-content-workspace.openfile">
  <code>abstract <strong><a href="#user-content-workspace.openfile">openFile</a></strong>(<a id="user-content-workspace.openfile^uri" href="#user-content-workspace.openfile^uri">uri</a>: <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String">string</a>, <a id="user-content-workspace.openfile^languageid" href="#user-content-workspace.openfile^languageid">languageId</a>: <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String">string</a>, <a id="user-content-workspace.openfile^view" href="#user-content-workspace.openfile^view">view</a>: <a href="https://codemirror.net/docs/ref#view.EditorView">EditorView</a>)</code></dt>

<dd><p>Called when an editor is created for a file. The implementation
should track the file in
<a href="#user-content-workspace.files"><code>this.files</code></a> and, if it wasn't
open already, call
<a href="#user-content-lspclient.didopen"><code>LSPClient.didOpen</code></a>.</p>
</dd><dt id="user-content-workspace.closefile">
  <code>abstract <strong><a href="#user-content-workspace.closefile">closeFile</a></strong>(<a id="user-content-workspace.closefile^uri" href="#user-content-workspace.closefile^uri">uri</a>: <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String">string</a>, <a id="user-content-workspace.closefile^view" href="#user-content-workspace.closefile^view">view</a>: <a href="https://codemirror.net/docs/ref#view.EditorView">EditorView</a>)</code></dt>

<dd><p>Called when an editor holding this file is destroyed or
reconfigured to no longer hold it. The implementation should
track this and, when it closes the file, make sure to call
<a href="#user-content-lspclient.didclose"><code>LSPClient.didClose</code></a>.</p>
</dd><dt id="user-content-workspace.connected">
  <code><strong><a href="#user-content-workspace.connected">connected</a></strong>()</code></dt>

<dd><p>Called when the client for this workspace is connected. The
default implementation calls
<a href="#user-content-lspclient.didopen"><code>LSPClient.didOpen</code></a> on all open
files.</p>
</dd><dt id="user-content-workspace.disconnected">
  <code><strong><a href="#user-content-workspace.disconnected">disconnected</a></strong>()</code></dt>

<dd><p>Called when the client for this workspace is disconnected. The
default implementation does nothing.</p>
</dd><dt id="user-content-workspace.updatefile">
  <code><strong><a href="#user-content-workspace.updatefile">updateFile</a></strong>(<a id="user-content-workspace.updatefile^uri" href="#user-content-workspace.updatefile^uri">uri</a>: <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String">string</a>, <a id="user-content-workspace.updatefile^update" href="#user-content-workspace.updatefile^update">update</a>: <a href="https://codemirror.net/docs/ref#state.TransactionSpec">TransactionSpec</a>)</code></dt>

<dd><p>Called when a server-initiated change to a file is applied. The
default implementation simply dispatches the update to the
file's view, if the file is open and has a view.</p>
</dd><dt id="user-content-workspace.displayfile">
  <code><strong><a href="#user-content-workspace.displayfile">displayFile</a></strong>(<a id="user-content-workspace.displayfile^uri" href="#user-content-workspace.displayfile^uri">uri</a>: <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String">string</a>) → <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise">Promise</a>&lt;<a href="https://codemirror.net/docs/ref#view.EditorView">EditorView</a> | <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/null">null</a>&gt;</code></dt>

<dd><p>When the client needs to put a file other than the one loaded in
the current editor in front of the user, for example in
<a href="#user-content-jumptodefinition"><code>jumpToDefinition</code></a>, it will call
this function. It should make sure to create or find an editor
with the file and make it visible to the user, or return null if
this isn't possible.</p>
</dd></dl>

</dd>
<dt id="user-content-workspacefile">
  <h4>
    <code>interface</code>
    <a href="#user-content-workspacefile">WorkspaceFile</a></h4>
</dt>

<dd><p>A file that is open in a workspace.</p>
<dl><dt id="user-content-workspacefile.uri">
  <code><strong><a href="#user-content-workspacefile.uri">uri</a></strong>: <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String">string</a></code></dt>

<dd><p>The file's unique URI.</p>
</dd><dt id="user-content-workspacefile.languageid">
  <code><strong><a href="#user-content-workspacefile.languageid">languageId</a></strong>: <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String">string</a></code></dt>

<dd><p>The LSP language ID for the file's content.</p>
</dd><dt id="user-content-workspacefile.version">
  <code><strong><a href="#user-content-workspacefile.version">version</a></strong>: <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number">number</a></code></dt>

<dd><p>The current version of the file.</p>
</dd><dt id="user-content-workspacefile.doc">
  <code><strong><a href="#user-content-workspacefile.doc">doc</a></strong>: <a href="https://codemirror.net/docs/ref#state.Text">Text</a></code></dt>

<dd><p>The document corresponding to <code>this.version</code>. Will not reflect
changes made after that version was synchronized. Will be
updated, along with <code>version</code>, by
<a href="#user-content-workspace.syncfiles"><code>syncFiles</code></a>.</p>
</dd><dt id="user-content-workspacefile.getview">
  <code><strong><a href="#user-content-workspacefile.getview">getView</a></strong>(<a id="user-content-workspacefile.getview^main" href="#user-content-workspacefile.getview^main">main</a>&#8288;?: <a href="https://codemirror.net/docs/ref#view.EditorView">EditorView</a>) → <a href="https://codemirror.net/docs/ref#view.EditorView">EditorView</a> | <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/null">null</a></code></dt>

<dd><p>Get an active editor view for this file, if there is one. For
workspaces that support multiple views on a file, <code>main</code>
indicates a preferred view.</p>
</dd></dl>

</dd>
</dl>
<h3>Extensions</h3>
<dl>
<dt id="user-content-languageserversupport">
  <code><strong><a href="#user-content-languageserversupport">languageServerSupport</a></strong>(<a id="user-content-languageserversupport^client" href="#user-content-languageserversupport^client">client</a>: <a href="#user-content-lspclient">LSPClient</a>, <a id="user-content-languageserversupport^uri" href="#user-content-languageserversupport^uri">uri</a>: <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String">string</a>, <a id="user-content-languageserversupport^languageid" href="#user-content-languageserversupport^languageid">languageID</a>&#8288;?: <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String">string</a>) → <a href="https://codemirror.net/docs/ref#state.Extension">Extension</a></code></dt>

<dd><p>Returns an extension that enables the <a href="#user-content-lspplugin">LSP
plugin</a> and all other features provided by
this package. You can also pick and choose individual extensions
from the exports. In that case, make sure to also include
<a href="#user-content-lspplugin%5ecreate"><code>LSPPlugin.create</code></a> in your
extensions, or the others will not work.</p>
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
<dt id="user-content-servercompletionsource">
  <code><strong><a href="#user-content-servercompletionsource">serverCompletionSource</a></strong>: <a href="https://codemirror.net/docs/ref#autocomplete.CompletionSource">CompletionSource</a></code></dt>

<dd><p>A completion source that requests completions from a language
server.</p>
</dd>
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
<a href="#user-content-formatdocument"><code>formatDocument</code></a>.</p>
</dd>
<dt id="user-content-renamesymbol">
  <code><strong><a href="#user-content-renamesymbol">renameSymbol</a></strong>: <a href="https://codemirror.net/docs/ref#view.Command">Command</a></code></dt>

<dd><p>This command will, if the cursor is over a word, prompt the user
for a new name for that symbol, and ask the language server to
perform a rename of that symbol.</p>
<p>Note that this may affect files other than the one loaded into
this view. See the
<a href="#user-content-workspace.updatefile"><code>Workspace.updateFile</code></a>
method.</p>
</dd>
<dt id="user-content-renamekeymap">
  <code><strong><a href="#user-content-renamekeymap">renameKeymap</a></strong>: readonly <a href="https://codemirror.net/docs/ref#view.KeyBinding">KeyBinding</a>[]</code></dt>

<dd><p>A keymap that binds F2 to <a href="#user-content-renamesymbol"><code>renameSymbol</code></a>.</p>
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
<dt id="user-content-signaturekeymap">
  <code><strong><a href="#user-content-signaturekeymap">signatureKeymap</a></strong>: readonly <a href="https://codemirror.net/docs/ref#view.KeyBinding">KeyBinding</a>[]</code></dt>

<dd><p>A keymap that binds</p>
<ul>
<li>
<p>Ctrl-Shift-Space (Cmd-Shift-Space on macOS) to
<a href="#user-content-showsignaturehelp"><code>showSignatureHelp</code></a></p>
</li>
<li>
<p>Ctrl-Shift-ArrowUp (Cmd-Shift-ArrowUp on macOS) to
<a href="#user-content-prevsignature"><code>prevSignature</code></a></p>
</li>
<li>
<p>Ctrl-Shift-ArrowDown (Cmd-Shift-ArrowDown on macOS) to
<a href="#user-content-nextsignature"><code>nextSignature</code></a></p>
</li>
</ul>
<p>Note that these keys are automatically bound by
<a href="#user-content-signaturehelp"><code>signatureHelp</code></a> unless you pass it
<code>keymap: false</code>.</p>
</dd>
<dt id="user-content-jumptodefinition">
  <code><strong><a href="#user-content-jumptodefinition">jumpToDefinition</a></strong>: <a href="https://codemirror.net/docs/ref#view.Command">Command</a></code></dt>

<dd><p>Jump to the definition of the symbol at the cursor. To support
cross-file jumps, you'll need to implement
<a href="#user-content-workspace.displayfile"><code>Workspace.displayFile</code></a>.</p>
</dd>
<dt id="user-content-jumptodeclaration">
  <code><strong><a href="#user-content-jumptodeclaration">jumpToDeclaration</a></strong>: <a href="https://codemirror.net/docs/ref#view.Command">Command</a></code></dt>

<dd><p>Jump to the declaration of the symbol at the cursor.</p>
</dd>
<dt id="user-content-jumptotypedefinition">
  <code><strong><a href="#user-content-jumptotypedefinition">jumpToTypeDefinition</a></strong>: <a href="https://codemirror.net/docs/ref#view.Command">Command</a></code></dt>

<dd><p>Jump to the type definition of the symbol at the cursor.</p>
</dd>
<dt id="user-content-jumptoimplementation">
  <code><strong><a href="#user-content-jumptoimplementation">jumpToImplementation</a></strong>: <a href="https://codemirror.net/docs/ref#view.Command">Command</a></code></dt>

<dd><p>Jump to the implementation of the symbol at the cursor.</p>
</dd>
<dt id="user-content-jumptodefinitionkeymap">
  <code><strong><a href="#user-content-jumptodefinitionkeymap">jumpToDefinitionKeymap</a></strong>: readonly <a href="https://codemirror.net/docs/ref#view.KeyBinding">KeyBinding</a>[]</code></dt>

<dd><p>Binds F12 to <a href="#user-content-jumptodefinition"><code>jumpToDefinition</code></a>.</p>
</dd>
<dt id="user-content-findreferences">
  <code><strong><a href="#user-content-findreferences">findReferences</a></strong>: <a href="https://codemirror.net/docs/ref#view.Command">Command</a></code></dt>

<dd><p>Ask the server to locate all references to the symbol at the
cursor. When the server can provide such references, show them as
a list in a panel.</p>
</dd>
<dt id="user-content-closereferencepanel">
  <code><strong><a href="#user-content-closereferencepanel">closeReferencePanel</a></strong>: <a href="https://codemirror.net/docs/ref#view.Command">Command</a></code></dt>

<dd><p>Close the reference panel, if it is open.</p>
</dd>
<dt id="user-content-findreferenceskeymap">
  <code><strong><a href="#user-content-findreferenceskeymap">findReferencesKeymap</a></strong>: readonly <a href="https://codemirror.net/docs/ref#view.KeyBinding">KeyBinding</a>[]</code></dt>

<dd><p>Binds Shift-F12 to <a href="#user-content-findreferences"><code>findReferences</code></a>
and Escape to
<a href="#user-content-closereferencepanel"><code>closeReferencePanel</code></a>.</p>
</dd>
</dl>
