import { EditorView, basicSetup } from "codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { LSPClient, JSONLSPClient, languageServerSupport } from "../dist/index.js";
import { JSONRPCMessage } from "../src/jsonclient.js";
import * as Comlink from 'comlink'
import { FilesystemWorker } from "./fs.worker.js";

class Transport {
    handlers: Set<(message: any) => void>;

    constructor(public worker: SharedWorker) {
        this.worker = worker;
        this.handlers = new Set();
        this.worker.port.onmessage = (event) => {
            for (const handler of this.handlers) {
                handler(JSON.stringify(event.data));
            }
        };
    }

    send(message: string) {
        this.worker.port.postMessage(JSON.parse(message));
    }

    subscribe(handler: (message: string) => void) {
        this.handlers.add(handler);
    }

    unsubscribe(handler: (message: string) => void) {
        this.handlers.delete(handler);
    }
}

// JSON Transport for the JSON client
class JSONTransport {
    handlers: Set<(message: any) => void>;

    constructor(public worker: SharedWorker) {
        this.worker = worker;
        this.handlers = new Set();
        this.worker.port.onmessage = (event) => {
            for (const handler of this.handlers) {
                handler(event.data);
            }
        };
        this.worker.port.start();
    }

    send(message: JSONRPCMessage) {
        this.worker.port.postMessage(message);
    }

    subscribe(handler: (message: JSONRPCMessage) => void) {
        this.handlers.add(handler);
    }

    unsubscribe(handler: (message: JSONRPCMessage) => void) {
        this.handlers.delete(handler);
    }
}

const sampleText = `
const channel = new MessageChannel();
const output = document.querySelector(".output");
const iframe = document.querySelector("iframe");

// Wait for the iframe to load
iframe.addEventListener("load", onLoad);

function onLoad() {
  // Listen for messages on port1
  channel.port1.onmessage = onMessage;

  // Transfer port2 to the iframe
  iframe.contentWindow.postMessage("Hello from the main page!", "*", [
    channel.port2,
  ]);
}

// Handle messages received on port1
function onMessage(e) {
  output.innerHTML = e.data;
}
`;
let store: any;

window.benchmark = async function (caseName) {
    const statusEl = document.getElementById('status')!;
    const editorEl = document.getElementById('editor')!;

    try {
        statusEl.textContent = `Starting ${caseName} benchmark...`;

        // Create filesystem worker
        const fsWorkerUrl = new URL('./fs.worker.js', import.meta.url);
        const fsWorker = new SharedWorker(fsWorkerUrl, { type: 'module' });
        fsWorker.port.start();
        const result = Comlink.wrap<{ proxy: typeof FilesystemWorker.proxy }>(fsWorker.port);
        const fs = await result.proxy('/filesystem-snapshot.json');

        // Create the worker
        const worker = new SharedWorker(new URL('./lsp.worker.js', import.meta.url), { type: 'module' });
        worker.port.start();
        const { createLanguageServer } = Comlink.wrap<{ createLanguageServer: ({ fs }: { fs: Comlink.Remote<FilesystemWorker> }) => Promise<void> }>(worker.port);
        store = createLanguageServer;
        await createLanguageServer(Comlink.proxy({ fs }));

        // Create client based on case
        let client;
        let transport;

        if (caseName === 'string') {
            // Use string-based transport (original LSPClient)
            transport = new Transport(worker);
            client = new LSPClient().connect(transport);
        } else if (caseName === 'object') {
            // Use object-based transport (JSONLSPClient)
            transport = new JSONTransport(worker);
            client = new JSONLSPClient().connect(transport);
        } else {
            throw new Error(`Unknown case: ${caseName}`);
        }

        statusEl.textContent = `Connecting ${caseName} client...`;

        // Connect to the language server
        await client.connect(transport).initializing;

        statusEl.textContent = `Connected! Creating editor with ${caseName} client...`;

        // Create CodeMirror editor with LSP support
        const view = new EditorView({
            doc: `// ${caseName} benchmark test`,
            extensions: [
                basicSetup,
                javascript({ jsx: true, typescript: true }),
                languageServerSupport(client, 'file:///test.ts', 'typescript')
            ],
            parent: editorEl
        });
        statusEl.textContent = `\`${caseName}\` benchmark running...`;

        for (let i = 0; i < sampleText.length; i++) {
            view.dispatch({
                changes: { from: view.state.doc.length, insert: sampleText[i] },
            });
            await new Promise(resolve => setTimeout(resolve, 10)); // Some delay
        }

        // Return some benchmark data
        return {
            caseName,
            clientType: caseName === 'string' ? 'LSPClient' : 'JSONLSPClient',
            connected: client.connected,
            capabilities: client.serverCapabilities
        };

    } catch (error) {
        statusEl.textContent = `Error in ${caseName} benchmark: ${error.message}`;
        console.error(`Benchmark ${caseName} failed:`, error);
        throw error;
    }
};