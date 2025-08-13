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

interface Metric {
    name: string;
    value: number;
}

// Display metrics comparison in table format
function displayMetricsComparison(caseName: string, beforeMetrics: Metric[], afterMetrics: Metric[], benchmarkResult: any) {
    console.log(`\n📊 Performance Metrics Comparison for "${caseName}" benchmark:`);
    console.log('='.repeat(80));

    // Create a map for easier lookup
    const beforeMap = new Map(beforeMetrics.map(m => [m.name, m.value]));
    const afterMap = new Map(afterMetrics.map(m => [m.name, m.value]));

    // Get all unique metric names
    const allMetricNames = new Set([...beforeMap.keys(), ...afterMap.keys()]);

    // Prepare table data
    const tableData: Array<{
        metric: string;
        before: string;
        after: string;
        difference: string;
        change: string;
    }> = [];

    for (const metricName of allMetricNames) {
        const beforeValue = beforeMap.get(metricName) || 0;
        const afterValue = afterMap.get(metricName) || 0;
        const difference = afterValue - beforeValue;
        const percentChange = beforeValue !== 0 ? ((difference / beforeValue) * 100) : 0;

        // Format values based on metric type
        const formatValue = (value: number, metric: string): string => {
            if (metric.toLowerCase().includes('time') || metric.toLowerCase().includes('duration')) {
                return `${value.toFixed(3)}ms`;
            } else if (metric.toLowerCase().includes('bytes') || metric.toLowerCase().includes('size')) {
                return `${(value / 1024).toFixed(2)}KB`;
            } else if (metric.toLowerCase().includes('count')) {
                return value.toString();
            } else {
                return value.toFixed(3);
            }
        };

        const changeIndicator = difference > 0 ? '📈' : difference < 0 ? '📉' : '➡️';

        tableData.push({
            metric: metricName,
            before: formatValue(beforeValue, metricName),
            after: formatValue(afterValue, metricName),
            difference: formatValue(Math.abs(difference), metricName),
            change: `${changeIndicator} ${percentChange.toFixed(1)}%`
        });
    }

    // Sort by absolute difference (descending) to show most impactful metrics first
    tableData.sort((a, b) => {
        const aDiff = Math.abs(parseFloat(a.difference.replace(/[^\d.-]/g, '')));
        const bDiff = Math.abs(parseFloat(b.difference.replace(/[^\d.-]/g, '')));
        return bDiff - aDiff;
    });

    // Display table header
    console.log('');
    console.log('| Metric'.padEnd(35) + '| Before'.padEnd(15) + '| After'.padEnd(15) + '| Difference'.padEnd(15) + '| Change'.padEnd(12) + '|');
    console.log('|' + '-'.repeat(34) + '|' + '-'.repeat(14) + '|' + '-'.repeat(14) + '|' + '-'.repeat(14) + '|' + '-'.repeat(11) + '|');

    // Display table rows
    for (const row of tableData) {
        console.log(
            '| ' + row.metric.padEnd(33) +
            '| ' + row.before.padEnd(13) +
            '| ' + row.after.padEnd(13) +
            '| ' + row.difference.padEnd(13) +
            '| ' + row.change.padEnd(10) + '|'
        );
    }

    console.log('');
    console.log(`🎯 Benchmark Result: ${JSON.stringify(benchmarkResult)}`);
    console.log('='.repeat(80));
    console.log('');
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
    console.log('Initial metrics collected, running benchmark...');
    const result = await page.evaluate(async (caseName) => {
        return window.benchmark(caseName);
    }, caseName);
    console.log('Benchmark completed, collecting final metrics...');
    const after = await client.send("Performance.getMetrics");
    console.log('Final metrics collected.');

    // Compare metrics and display in table format
    displayMetricsComparison(caseName, before.metrics, after.metrics, result);

    await browser.close();
}

await run('string');
await run('object');
process.exit(0);