import { createConnection } from 'vscode-languageserver/browser';
import { BrowserMessageReader, BrowserMessageWriter } from '@volar/language-server/browser';
import { create as createTypeScriptServicePlugins } from 'volar-service-typescript'
import { Connection, createServerBase, createTypeScriptProject } from '@volar/language-server/browser';
import ts from 'typescript';
import * as Comlink from 'comlink';
import type { FilesystemWorker } from './fs.worker';

let remoteFilesystemWorker: Comlink.Remote<FilesystemWorker> | null = null;

const getLanguageServicePlugins = (_ts: typeof ts) => {
    const plugins = [
        // @ts-ignore
        ...createTypeScriptServicePlugins(_ts),
        // ...more?
    ]
    return plugins
}

const createLanguageServer = async ({ fs, connection }: { connection: Connection, fs: Comlink.Remote<FilesystemWorker> }) => {
    const server = createServerBase(connection, {
        timer: {
            setImmediate: (callback: (...args: any[]) => void, ...args: any[]) => {
                setTimeout(callback, 0, ...args);
            },
        },
    });

    server.fileSystem.install('file', fs);
    connection.onInitialize(async (params) => {
        const languageServicePlugins = getLanguageServicePlugins(ts)

        return server.initialize(
            params,
            createTypeScriptProject(
                // @ts-ignore
                ts,
                undefined,
                async () => ({
                    // rootUri: params.rootUri,
                    languagePlugins: []
                })
            ),
            languageServicePlugins
        )
    })
    connection.onInitialized(() => {
        server.initialized();
        const extensions = [
            '.tsx',
            '.jsx',
            '.js',
            '.ts'
        ]
        server.fileWatcher.watchFiles([`**/*.{${extensions.join(',')}}`])
    });
    return server;
}

// @ts-expect-error
onconnect = async (event) => {
    const [port] = event.ports;
    const reader = new BrowserMessageReader(port);
    const writer = new BrowserMessageWriter(port);
    const connection = createConnection(reader, writer);

    const proxy = async ({ fs }: { fs: Comlink.Remote<FilesystemWorker> }) => {
        if (remoteFilesystemWorker) return;

        remoteFilesystemWorker = fs;
        await createLanguageServer({ fs: remoteFilesystemWorker, connection });
        connection.listen();
    }
    Comlink.expose({ createLanguageServer: proxy }, port);
}