import { fs } from 'memfs';
import { fromBinarySnapshotSync } from 'memfs/lib/snapshot';
import { FileStat, FileSystem, FileType } from "@volar/language-server";
import * as Comlink from 'comlink';
import { URI } from 'vscode-uri';

export class FilesystemWorker implements FileSystem {

    constructor(snapshot: Uint8Array | null = null) {
        if (snapshot) {
            fromBinarySnapshotSync(snapshot as any, { fs });
        }
    }

    static async proxy(snapshotUrl: string) {
        const response = await fetch(snapshotUrl);
        const uint8Array = new Uint8Array(await response.arrayBuffer());
        return Comlink.proxy(new FilesystemWorker(uint8Array));
    }

    async stat(uri: URI) {
        try {
            const stat = await fs.promises.stat(uri.path);
            let type = FileType.File;

            switch ((stat.mode as number) & 0o170000) {
                case 0o040000:
                    type = FileType.Directory;
                    break;
                case 0o120000:
                    type = FileType.SymbolicLink;
                    break;
            }
            return {
                name: uri.path,
                atime: stat.atime,
                mtime: stat.mtime,
                ctime: stat.ctime,
                size: stat.size,
                type,
            } as unknown as FileStat;
        } catch (error) {
            return undefined;
        }
    }

    async readDirectory(uri: URI) {
        const files = await fs.promises.readdir(uri.path, { withFileTypes: true, encoding: "utf-8" });

        return files.map((ent: any) => {
            let type = FileType.File;
            switch ((ent.mode as number) & 0o170000) {
                case 0o040000:
                    type = FileType.Directory;
                    break;
                case 0o120000:
                    type = FileType.SymbolicLink;
                    break;
            }
            return [ent.name, type];
        }) as [string, FileType][];
    }

    async readFile(uri: URI): Promise<string> {
        return fs.promises.readFile(uri.path, { encoding: "utf-8" }) as Promise<string>;
    }

    async readdir(path: string, options?: any) {
        return fs.promises.readdir(path, options);
    }

    async writeFile(path: string, data: any, options?: any) {
        return fs.promises.writeFile(path, data, options);
    }

    async mkdir(path: string, options?: any) {
        return fs.promises.mkdir(path, options);
    }

    async exists(path: string) {
        return fs.existsSync(path);
    }
}

onconnect = async function (event) {
    Comlink.expose({ proxy: Comlink.proxy(FilesystemWorker.proxy) }, event.ports[0]);
}