import { defineConfig } from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { fs as memfs } from 'memfs';
import { toBinarySnapshotSync } from 'memfs/lib/snapshot';
import * as fs from 'fs'

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Plugin to create filesystem snapshot
function createFilesystemSnapshot() {
    return {
        name: 'snapshot',
        buildStart() {
            // Create snapshot of TypeScript lib files
            const nodeModulesPath = join(__dirname, '../node_modules');
            const typescriptLibPath = join(nodeModulesPath, 'typescript/lib');

            // Add TypeScript lib files if they exist
            if (existsSync(typescriptLibPath)) {
                try {
                    const libFiles: string[] = [];

                    memfs.mkdirSync('/node_modules/typescript/lib', { recursive: true });

                    const files = fs.readdirSync(typescriptLibPath);
                    files.forEach(file => {
                        if (file.startsWith('lib.') && file.endsWith('.d.ts')) {
                            libFiles.push(file);
                        }
                    });

                    libFiles.forEach(libFile => {
                        const libPath = join(typescriptLibPath, libFile);
                        if (existsSync(libPath)) {
                            const content = readFileSync(libPath, 'utf-8');
                            memfs.writeFileSync(`/node_modules/typescript/lib/${libFile}`, content);
                        }
                    });

                    // Add basic tsconfig.json
                    const tsconfig = {
                        compilerOptions: {
                            target: "esnext",
                            lib: ["ES2020", "DOM", "DOM.Iterable"],
                            module: "esnext",
                            moduleResolution: "node",
                            strict: false,
                            esModuleInterop: true,
                            skipLibCheck: true,
                            forceConsistentCasingInFileNames: true
                        },
                        include: ["**/*.ts", "**/*.tsx"],
                    };
                    memfs.writeFileSync('/tsconfig.json', JSON.stringify(tsconfig, null, 2));

                } catch (error) {
                    console.warn('Failed to snapshot TypeScript libs:', error);
                }
            }

            // Create snapshot
            const uint8 = toBinarySnapshotSync({ fs: memfs, path: '/' });

            // Write snapshot to public directory
            const publicDir = join(__dirname, 'public');
            if (!existsSync(publicDir)) {
                fs.mkdirSync(publicDir, { recursive: true });
            }

            const snapshotPath = join(publicDir, 'snapshot.bin');
            fs.writeFileSync(snapshotPath, uint8);
        }
    };
}

export default defineConfig({
    root: './benchmark',
    publicDir: './public',
    server: {
        port: 3000,
        host: 'localhost'
    },
    optimizeDeps: {
        include: [
            'memfs',
            'memfs/lib/snapshot',
            '@volar/language-server',
            '@volar/language-server/browser',
            'vscode-languageserver/browser',
            'volar-service-typescript',
            'typescript',
            'comlink',
            'vscode-uri'
        ]
    },
    resolve: {
        alias: {
            // Ensure proper resolution of the dist files
            '@codemirror/lsp-client': '../dist/index.js'
        }
    },
    define: {
        global: 'globalThis'
    },
    worker: {
        format: 'es',
        plugins: () => [
            nodePolyfills({
                globals: {
                    Buffer: true,
                    global: true,
                    process: true,
                },
                protocolImports: true,
            })
        ]
    },
    plugins: [
        nodePolyfills({
            // Whether to polyfill specific globals.
            globals: {
                Buffer: true, // can also be 'build', 'dev', or false
                global: true,
                process: true,
            },
            // Whether to polyfill `node:` protocol imports.
            protocolImports: true,
        }),
        createFilesystemSnapshot(),
    ]
});