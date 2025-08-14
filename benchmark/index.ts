import { EditorView, basicSetup } from "codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { LSPClient, JSONLSPClient, languageServerSupport } from "../dist/index.js";
import * as Comlink from 'comlink'
import { FilesystemWorker } from "./fs.worker.ts";
import { JSONTransport, Transport } from "./transport.js";
import { Transaction } from "@codemirror/state";

let store: any;

window.benchmark = async function (caseName) {
    const statusEl = document.getElementById('status')!;
    const editorEl = document.getElementById('editor')!;

    try {
        statusEl.textContent = `Starting ${caseName} benchmark...`;

        // Create filesystem worker
        const fsWorkerUrl = new URL('./fs.worker.ts', import.meta.url);
        const fsWorker = new SharedWorker(fsWorkerUrl, { type: 'module' });
        fsWorker.port.start();
        const result = Comlink.wrap<{ proxy: typeof FilesystemWorker.proxy }>(fsWorker.port);
        const fs = await result.proxy('/snapshot.bin');

        // Create the worker
        const worker = new SharedWorker(new URL('./lsp.worker.ts', import.meta.url), { type: 'module' });
        worker.port.start();
        const { createLanguageServer } = Comlink.wrap<{ createLanguageServer: ({ fs }: { fs: Comlink.Remote<FilesystemWorker> }) => Promise<void> }>(worker.port);
        store = createLanguageServer;
        await createLanguageServer(Comlink.proxy({ fs }));

        let client;
        let transport;

        if (caseName === 'string') {
            transport = new Transport(worker);
            client = new LSPClient().connect(transport);
        } else if (caseName === 'object') {
            transport = new JSONTransport(worker);
            client = new JSONLSPClient().connect(transport);
        } else {
            throw new Error(`Unknown case: ${caseName}`);
        }

        statusEl.textContent = `Connecting ${caseName} client...`;
        await client.connect(transport).initializing;
        statusEl.textContent = `Connected! Creating editor with ${caseName} client...`;

        const view = new EditorView({
            doc: `// ${caseName} benchmark test`,
            extensions: [
                basicSetup,
                javascript({ jsx: true, typescript: true }),
                languageServerSupport(client, 'file:///test.ts', 'typescript')
            ],
            parent: editorEl
        });
        statusEl.textContent = `\`${caseName}\` benchmark ready.`;

        // Expose EditorView/etc. to Playwright
        window.view = view;
        window.userEvent = Transaction.userEvent;
    } catch (error) {
        statusEl.textContent = `Error in ${caseName} benchmark: ${error.message}`;
        console.error(`Benchmark ${caseName} failed:`, error);
        throw error;
    }
};