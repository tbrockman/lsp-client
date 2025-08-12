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
function startViteServer(): Promise<void> {
    return new Promise((resolve, reject) => {
        const vite = spawn('npx', ['vite', '--config', 'benchmark/vite.config.js'], {
            stdio: 'pipe',
            cwd: dirname(__dirname)
        });

        vite.stdout.on('data', (data) => {
            const output = data.toString();
            console.log(output);
            if (output.includes('Local:') && output.includes('3000')) {
                resolve();
            }
        });

        vite.stderr.on('data', (data) => {
            console.error('Vite error:', data.toString());
        });

        vite.on('error', reject);

        // Give it some time to start
        setTimeout(resolve, 3000);
    });
}

async function run(caseName: string) {
    const port = 3000;

    // Start Vite dev server
    console.log('Starting Vite dev server...');
    await startViteServer();

    const browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const context = await browser.newContext();
    const page = await context.newPage();

    // Connect to DevTools Protocol
    const client = await context.newCDPSession(page);
    await client.send("Performance.enable");

    console.log('Navigating to benchmark page...');

    // Navigate to the served HTML file
    await page.goto(`http://localhost:${port}/index.html`);

    console.log(`Running benchmark for case: ${caseName}`);
    // Wait for the page to load and the benchmark function to be available
    console.log('Waiting for benchmark function...');
    await page.waitForFunction(() => typeof window.benchmark === 'function', { timeout: 10000 });

    console.log('Starting benchmark...');
    const before = await client.send("Performance.getMetrics");
    console.log('Initial metrics collected, running benchmark...');
    const result = await page.evaluate(async (caseName) => {
        return window.benchmark(caseName);
    }, caseName);
    console.log('Benchmark completed, collecting final metrics...');
    const after = await client.send("Performance.getMetrics");
    console.log('Final metrics collected.');

    console.log({
        caseName,
        result,
        before: before.metrics.length,
        after: after.metrics.length
    });

    await browser.close();
    return; // Exit after first test for now
}

await run('string');
await run('object');