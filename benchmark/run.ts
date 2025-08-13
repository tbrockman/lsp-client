import { chromium } from "playwright";
import { spawn } from "child_process";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

declare global {
    interface Window {
        benchmark: (caseName: string) => Promise<any>;
    }
}

// Start Vite dev server
function startViteServer(): Promise<number> {
    return new Promise((resolve, reject) => {
        const vite = spawn('npx', ['vite', '--config', 'benchmark/vite.config.js'], {
            stdio: 'pipe',
            cwd: dirname(__dirname)
        });

        let resolved = false;

        vite.stdout.on('data', (data) => {
            const output = data.toString();
            console.log(output);

            // Look for the Local URL in Vite's output
            const localMatch = output.match(/Local:\s+http:\/\/localhost:(\d+)/);
            if (localMatch && !resolved) {
                const port = parseInt(localMatch[1], 10);
                console.log(`Vite server started on port ${port}`);
                resolved = true;
                resolve(port);
            }
        });

        vite.stderr.on('data', (data) => {
            console.error('Vite error:', data.toString());
        });

        vite.on('error', (error) => {
            if (!resolved) {
                resolved = true;
                reject(error);
            }
        });

        vite.on('close', (code) => {
            if (!resolved && code !== 0) {
                resolved = true;
                reject(new Error(`Vite process exited with code ${code}`));
            }
        });

        // Timeout after 30 seconds if Vite doesn't start
        setTimeout(() => {
            if (!resolved) {
                resolved = true;
                reject(new Error('Timeout waiting for Vite server to start'));
            }
        }, 30000);
    });
}

async function run(caseName: string) {
    // Start Vite dev server
    console.log('Starting Vite dev server...');
    const port = await startViteServer();

    const browser = await chromium.launch({
        headless: false,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const context = await browser.newContext();
    const page = await context.newPage();

    // Connect to DevTools Protocol
    const client = await context.newCDPSession(page);
    await client.send("Performance.enable");

    console.log('Navigating to benchmark page...');

    // Navigate to the served HTML file
    await page.goto(`http://localhost:${port}/index.html`, { timeout: 120000 });

    console.log(`Running benchmark for case: ${caseName}`);
    // Wait for the page to load and the benchmark function to be available
    console.log('Waiting for benchmark function...');
    await page.waitForFunction(() => typeof window.benchmark === 'function', { timeout: 10000 });

    console.log('Starting benchmark...');
    const before = await client.send("Performance.getMetrics");
    console.log('Initial metrics collected, running benchmark...', { before });
    const result = await page.evaluate(async (caseName) => {
        return window.benchmark(caseName);
    }, caseName);
    console.log('Benchmark completed, collecting final metrics...');
    const after = await client.send("Performance.getMetrics");
    console.log('Final metrics collected.');

    console.log({
        caseName,
        result,
        before,
        after
    });

    await browser.close();
    return; // Exit after first test for now
}

await run('string');
await run('object');
process.exit(0);