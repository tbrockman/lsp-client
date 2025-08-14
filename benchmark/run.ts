import { chromium } from "playwright";
import { spawn } from "child_process";
import { dirname } from "path";
import { fileURLToPath } from "url";
import { simulations } from "./simulations";
import { BenchmarkContext } from "./utils";

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

interface CPUUsageSnapshot {
    timestamp: number;
    usage: number;
}

interface CPUStats {
    average: number;
    snapshots: CPUUsageSnapshot[];
}

interface BenchmarkResult {
    caseName: string;
    beforeMetrics: Metric[];
    afterMetrics: Metric[];
    result: any;
    executionTime: number;
    cpuStats: CPUStats;
}

interface AveragedBenchmarkResult {
    caseName: string;
    beforeMetrics: Metric[];
    afterMetrics: Metric[];
    result: any;
    executionTime: number;
    cpuStats: CPUStats;
    runCount: number;
}

// Calculate average of multiple benchmark results
function averageBenchmarkResults(results: BenchmarkResult[]): AveragedBenchmarkResult {
    if (results.length === 0) {
        throw new Error('Cannot average empty results array');
    }

    const caseName = results[0].caseName;
    const runCount = results.length;

    // Average execution time
    const avgExecutionTime = results.reduce((sum, r) => sum + r.executionTime, 0) / runCount;

    // Average CPU stats
    const avgCpuAverage = results.reduce((sum, r) => sum + r.cpuStats.average, 0) / runCount;

    // Combine all CPU snapshots (we'll keep all snapshots for reference)
    const allSnapshots = results.flatMap(r => r.cpuStats.snapshots);

    // Average metrics - we'll use the metric names from the first result as template
    const avgBeforeMetrics: Metric[] = [];
    const avgAfterMetrics: Metric[] = [];

    // Get all unique metric names from before metrics
    const beforeMetricNames = new Set(results.flatMap(r => r.beforeMetrics.map(m => m.name)));
    for (const metricName of beforeMetricNames) {
        const values = results
            .map(r => r.beforeMetrics.find(m => m.name === metricName)?.value || 0)
            .filter(v => v !== undefined);
        const avgValue = values.reduce((sum, v) => sum + v, 0) / values.length;
        avgBeforeMetrics.push({ name: metricName, value: avgValue });
    }

    // Get all unique metric names from after metrics
    const afterMetricNames = new Set(results.flatMap(r => r.afterMetrics.map(m => m.name)));
    for (const metricName of afterMetricNames) {
        const values = results
            .map(r => r.afterMetrics.find(m => m.name === metricName)?.value || 0)
            .filter(v => v !== undefined);
        const avgValue = values.reduce((sum, v) => sum + v, 0) / values.length;
        avgAfterMetrics.push({ name: metricName, value: avgValue });
    }

    return {
        caseName,
        beforeMetrics: avgBeforeMetrics,
        afterMetrics: avgAfterMetrics,
        result: results[0].result, // Use first result as representative
        executionTime: avgExecutionTime,
        cpuStats: {
            average: avgCpuAverage,
            snapshots: allSnapshots
        },
        runCount
    };
}

// Display metrics comparison between string and object benchmark cases
function displayBenchmarkComparison(stringBenchmark: AveragedBenchmarkResult, objectBenchmark: AveragedBenchmarkResult) {
    console.log(`\n📊 Performance Metrics Comparison: "string" vs "object" benchmarks (averaged over ${stringBenchmark.runCount} and ${objectBenchmark.runCount} runs):`);
    console.log('='.repeat(80));

    // Display execution time and CPU usage comparison first
    console.log('\n⏱️  Execution Time & CPU Usage:');
    console.log('-'.repeat(50));
    console.log(`String benchmark execution time: ${stringBenchmark.executionTime.toFixed(3)}ms`);
    console.log(`Object benchmark execution time: ${objectBenchmark.executionTime.toFixed(3)}ms`);
    const timeDiff = objectBenchmark.executionTime - stringBenchmark.executionTime;
    const timeChangePercent = stringBenchmark.executionTime !== 0 ? ((timeDiff / stringBenchmark.executionTime) * 100) : 0;
    const timeIndicator = timeDiff > 0 ? '📈' : timeDiff < 0 ? '📉' : '➡️';
    console.log(`Time difference: ${timeIndicator} ${Math.abs(timeDiff).toFixed(3)}ms (${timeChangePercent.toFixed(1)}%)`);

    console.log(`\nString benchmark average CPU usage: ${(stringBenchmark.cpuStats.average * 100).toFixed(2)}%`);
    console.log(`Object benchmark average CPU usage: ${(objectBenchmark.cpuStats.average * 100).toFixed(2)}%`);
    const cpuDiff = objectBenchmark.cpuStats.average - stringBenchmark.cpuStats.average;
    const cpuChangePercent = stringBenchmark.cpuStats.average !== 0 ? ((cpuDiff / stringBenchmark.cpuStats.average) * 100) : 0;
    const cpuIndicator = cpuDiff > 0 ? '📈' : cpuDiff < 0 ? '📉' : '➡️';
    console.log(`CPU usage difference: ${cpuIndicator} ${Math.abs(cpuDiff * 100).toFixed(2)}% (${cpuChangePercent.toFixed(1)}%)`);

    // Create maps for easier lookup - using after metrics as they represent the final state
    const stringMap = new Map(stringBenchmark.afterMetrics.map(m => [m.name, m.value]));
    const objectMap = new Map(objectBenchmark.afterMetrics.map(m => [m.name, m.value]));

    // Get all unique metric names
    const allMetricNames = new Set([...stringMap.keys(), ...objectMap.keys()]);

    // Prepare table data
    const tableData: Array<{
        metric: string;
        string: string;
        object: string;
        difference: string;
        change: string;
    }> = [];

    for (const metricName of allMetricNames) {
        const stringValue = stringMap.get(metricName) || 0;
        const objectValue = objectMap.get(metricName) || 0;
        const difference = objectValue - stringValue;
        const percentChange = stringValue !== 0 ? ((difference / stringValue) * 100) : 0;

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
            string: formatValue(stringValue, metricName),
            object: formatValue(objectValue, metricName),
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

    // Display detailed metrics table
    console.log('\n🔍 Detailed Performance Metrics:');
    console.log('| Metric'.padEnd(35) + '| String'.padEnd(15) + '| Object'.padEnd(15) + '| Difference'.padEnd(15) + '| Change'.padEnd(12) + '|');
    console.log('|' + '-'.repeat(34) + '|' + '-'.repeat(14) + '|' + '-'.repeat(14) + '|' + '-'.repeat(14) + '|' + '-'.repeat(11) + '|');

    // Display table rows
    for (const row of tableData) {
        console.log(
            '| ' + row.metric.padEnd(33) +
            '| ' + row.string.padEnd(13) +
            '| ' + row.object.padEnd(13) +
            '| ' + row.difference.padEnd(13) +
            '| ' + row.change.padEnd(10) + '|'
        );
    }

    console.log('');
    console.log('='.repeat(80));
    console.log('');
}

interface ViteServer {
    port: number;
    close: () => void;
}

// Start Vite dev server
function startViteServer(): Promise<ViteServer> {
    return new Promise((resolve, reject) => {
        const vite = spawn('npx', ['vite', '--config', 'benchmark/vite.config.ts'], {
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
                resolve({
                    port,
                    close: () => {
                        vite.kill();
                    }
                });
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

function processMetrics(metrics: any): {
    timestamp: number;
    activeTime: number;
} {
    const activeTime = metrics.metrics.filter((m: any) => m.name.includes("Duration")).map((m: any) => m.value).reduce((a: number, b: number) => a + b, 0);
    return {
        timestamp: metrics.metrics.find((m: any) => m.name === "Timestamp")?.value || 0,
        activeTime
    };
}

// Bit skeptical about this, credit: https://github.com/puppeteer/puppeteer/issues/6429#issuecomment-881756451
async function monitorTimeActive(cdp: any, interval: number): Promise<() => Promise<CPUStats>> {
    const { timestamp: startTime, activeTime: initialActiveTime } = processMetrics(await cdp.send("Performance.getMetrics"));
    const snapshots: CPUUsageSnapshot[] = [];
    let cumulativeActiveTime = initialActiveTime;

    let lastTimestamp = startTime;
    const timer = setInterval(async () => {
        const { timestamp, activeTime } = processMetrics(await cdp.send("Performance.getMetrics"));
        const frameDuration = timestamp - lastTimestamp;
        let usage = (activeTime - cumulativeActiveTime) / frameDuration;
        cumulativeActiveTime = activeTime;

        if (usage > 1) usage = 1;
        snapshots.push({
            timestamp,
            usage
        });

        lastTimestamp = timestamp;
    }, interval);

    return async () => {
        clearInterval(timer);

        return {
            average: cumulativeActiveTime / (lastTimestamp - startTime),
            snapshots
        };
    };
}

// Run multiple benchmark iterations and return averaged results
async function runMultipleBenchmarks(caseName: string, count: number): Promise<AveragedBenchmarkResult> {
    console.log(`\n🚀 Running ${caseName} benchmark ${count} times...`);

    // Start Vite server for this benchmark case
    console.log(`Starting Vite dev server for ${caseName} benchmark...`);
    const viteServer = await startViteServer();

    // Start Chromium instance for this benchmark case
    console.log(`Starting Chromium browser for ${caseName} benchmark...`);
    const browser = await chromium.launch({
        headless: false,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        // Run multiple iterations
        const results: BenchmarkResult[] = [];
        for (let i = 0; i < count; i++) {
            console.log(`\n--- ${caseName} benchmark run ${i + 1}/${count} ---`);

            // Create a new context for each run for better isolation
            const browserContext = await browser.newContext();
            const page = await browserContext.newPage();

            try {
                // Connect to DevTools Protocol
                const client = await browserContext.newCDPSession(page);
                await client.send("Performance.enable");

                console.log(`Navigating to benchmark page for ${caseName}...`);

                // Navigate to the served HTML file
                await page.goto(`http://localhost:${viteServer.port}/index.html`, { timeout: 120000 });

                console.log(`Setting up benchmark for case: ${caseName}`);
                // Wait for the page to load and the benchmark function to be available
                console.log('Waiting for benchmark function...');
                await page.waitForFunction(() => typeof window.benchmark === 'function', { timeout: 10000 });

                console.log(`Running ${caseName} benchmark iteration...`);

                // Start CPU monitoring
                const stopMonitoring = await monitorTimeActive(client, 100); // Sample every 100ms

                const before = await client.send("Performance.getMetrics");
                console.log('Initial metrics collected, running benchmark...');

                // Record execution time
                const startTime = performance.now();
                await page.evaluate(async (caseName) => {
                    return window.benchmark(caseName);
                }, caseName);

                const context = new BenchmarkContext(page);

                for (const sim of simulations) {
                    await context.setStatusText(`Running ${sim.name} phase...`);
                    await sim.fn(context);
                }

                const endTime = performance.now();
                const executionTime = endTime - startTime;

                console.log('Benchmark completed, collecting final metrics...');
                const after = await client.send("Performance.getMetrics");

                // Stop CPU monitoring and get stats
                const cpuStats = await stopMonitoring();

                console.log('Final metrics collected.');

                const benchmarkResult: BenchmarkResult = {
                    caseName,
                    beforeMetrics: before.metrics,
                    afterMetrics: after.metrics,
                    result: null, // No specific result needed for these benchmarks
                    executionTime,
                    cpuStats
                };

                results.push(benchmarkResult);

            } finally {
                // Always close the context after each run
                await browserContext.close();
            }

            // Small delay between runs to let the system settle
            if (i < count - 1) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        // Calculate and return averaged results
        const averaged = averageBenchmarkResults(results);
        console.log(`\n✅ Completed ${count} runs of ${caseName} benchmark. Average execution time: ${averaged.executionTime.toFixed(3)}ms`);
        return averaged;
    } catch (error) {
        console.error(`Error occurred during ${caseName} benchmark:`, error);
        throw error;
    } finally {
        // Always close the browser and Vite server when done
        console.log(`Closing Chromium browser for ${caseName} benchmark...`);
        await browser.close();
        console.log(`Closing Vite server for ${caseName} benchmark...`);
        viteServer.close();
    }
}

async function run(count: number = 3) {
    console.log(`\n🎯 Running benchmarks with ${count} iterations per case...`);

    // Run both benchmarks with multiple iterations
    const stringBenchmark = await runMultipleBenchmarks('string', count);
    const objectBenchmark = await runMultipleBenchmarks('object', count);

    // Compare the averaged benchmarks
    displayBenchmarkComparison(stringBenchmark, objectBenchmark);
}

// You can change the count parameter to run more or fewer iterations
const benchmarkCount = process.argv[2] ? parseInt(process.argv[2]) : 3;
console.log(`Starting benchmark with ${benchmarkCount} iterations per case...`);
await run(benchmarkCount);
process.exit(0);