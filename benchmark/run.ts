import { chromium, CDPSession } from "playwright";
import { spawn } from "child_process";
import { dirname } from "path";
import { fileURLToPath } from "url";
import { simulations } from "./simulations";
import { BenchmarkContext } from "./utils";
import { Profiler } from "inspector";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface Metric {
    name: string;
    value: number;
}

interface ProfileStats {
    totalTime: number;
    samples: number;
    nodes: number;
}

interface TargetBenchmarkData {
    targetId: string;
    targetType: string;
    deltaMetrics: Metric[];
    profileStats: ProfileStats;
    heapUsage: { usedBytesDelta: number; totalBytesDelta: number };
}


interface BenchmarkResult {
    caseName: string;
    executionTime: number;
    targets: TargetBenchmarkData[];
}

interface AveragedBenchmarkResult {
    caseName: string;
    executionTime: number;
    targets: TargetBenchmarkData[];
    runCount: number;
}

/**
 * Averages the results of multiple benchmark runs.
 */
function averageBenchmarkResults(results: BenchmarkResult[]): AveragedBenchmarkResult {
    if (results.length === 0) {
        throw new Error('Cannot average empty results array');
    }

    const caseName = results[0].caseName;
    const runCount = results.length;

    const avgExecutionTime = results.reduce((sum, r) => sum + r.executionTime, 0) / runCount;

    const targetsByType = new Map<string, TargetBenchmarkData[]>();
    for (const result of results) {
        for (const target of result.targets) {
            if (!targetsByType.has(target.targetType)) {
                targetsByType.set(target.targetType, []);
            }
            targetsByType.get(target.targetType)!.push(target);
        }
    }

    const avgTargets: TargetBenchmarkData[] = [];
    for (const [targetType, targets] of targetsByType) {
        if (targets.length > 0) {
            const avgTotalTime = targets.reduce((sum, t) => sum + t.profileStats.totalTime, 0) / targets.length;
            const avgSamples = targets.reduce((sum, t) => sum + t.profileStats.samples, 0) / targets.length;
            const avgNodes = targets.reduce((sum, t) => sum + t.profileStats.nodes, 0) / targets.length;

            // NEW: heap usage averaging
            const avgUsedBytesDelta = targets.reduce((sum, t) => sum + (t.heapUsage?.usedBytesDelta || 0), 0) / targets.length;
            const avgTotalBytesDelta = targets.reduce((sum, t) => sum + (t.heapUsage?.totalBytesDelta || 0), 0) / targets.length;

            const avgDeltaMetrics: Metric[] = [];
            const deltaMetricNames = new Set(targets.flatMap(t => t.deltaMetrics.map(m => m.name)));

            for (const metricName of deltaMetricNames) {
                const values = targets
                    .map(t => t.deltaMetrics.find(m => m.name === metricName)?.value || 0)
                    .filter(v => v !== undefined);
                const avgValue = values.reduce((sum, v) => sum + v, 0) / values.length;
                avgDeltaMetrics.push({ name: metricName, value: avgValue });
            }

            avgTargets.push({
                targetId: `avg-${targetType}`,
                targetType,
                deltaMetrics: avgDeltaMetrics,
                profileStats: {
                    totalTime: avgTotalTime,
                    samples: avgSamples,
                    nodes: avgNodes
                },
                heapUsage: {
                    usedBytesDelta: avgUsedBytesDelta,
                    totalBytesDelta: avgTotalBytesDelta
                }
            });
        }
    }

    return {
        caseName,
        executionTime: avgExecutionTime,
        targets: avgTargets,
        runCount
    };
}


/**
 * Displays a formatted comparison between two averaged benchmark results.
 */
function displayBenchmarkComparison(stringBenchmark: AveragedBenchmarkResult, objectBenchmark: AveragedBenchmarkResult) {
    console.log(`\n📊 Performance Metrics Comparison: "string" vs "object" benchmarks (averaged over ${stringBenchmark.runCount} and ${objectBenchmark.runCount} runs):`);
    console.log('='.repeat(80));

    console.log('\n⏱️  Overall Execution Time:');
    console.log('-'.repeat(50));
    console.log(`String benchmark execution time: ${stringBenchmark.executionTime.toFixed(3)}ms`);
    console.log(`Object benchmark execution time: ${objectBenchmark.executionTime.toFixed(3)}ms`);
    const timeDiff = objectBenchmark.executionTime - stringBenchmark.executionTime;
    const timeChangePercent = stringBenchmark.executionTime !== 0 ? ((timeDiff / stringBenchmark.executionTime) * 100) : 0;
    const timeIndicator = timeDiff > 0 ? '📈' : timeDiff < 0 ? '📉' : '➡️';
    console.log(`Time difference: ${timeIndicator} ${Math.abs(timeDiff).toFixed(3)}ms (${timeChangePercent.toFixed(1)}%)`);

    const stringTargetMap = new Map(stringBenchmark.targets.map(t => [t.targetType, t]));
    const objectTargetMap = new Map(objectBenchmark.targets.map(t => [t.targetType, t]));
    const allTargetTypes = new Set([...stringTargetMap.keys(), ...objectTargetMap.keys()]);

    for (const targetType of allTargetTypes) {
        const stringTarget = stringTargetMap.get(targetType);
        const objectTarget = objectTargetMap.get(targetType);

        console.log(`\n🎯 ${targetType.toUpperCase()} Performance:`);
        console.log('-'.repeat(50));

        if (stringTarget && objectTarget) {
            console.log(`Profile time - String: ${stringTarget.profileStats.totalTime.toFixed(3)}ms, Object: ${objectTarget.profileStats.totalTime.toFixed(3)}ms`);
            const profileTimeDiff = objectTarget.profileStats.totalTime - stringTarget.profileStats.totalTime;
            const profileTimeChangePercent = stringTarget.profileStats.totalTime !== 0 ? ((profileTimeDiff / stringTarget.profileStats.totalTime) * 100) : 0;
            const profileTimeIndicator = profileTimeDiff > 0 ? '📈' : profileTimeDiff < 0 ? '📉' : '➡️';
            console.log(`Profile time difference: ${profileTimeIndicator} ${Math.abs(profileTimeDiff).toFixed(3)}ms (${profileTimeChangePercent.toFixed(1)}%)`);

            displayTargetMetricsComparison(targetType, stringTarget, objectTarget);

        } else if (stringTarget) {
            console.log(`String benchmark: ${stringTarget.profileStats.totalTime.toFixed(3)}ms (${stringTarget.profileStats.samples} samples)`);
            console.log(`Object benchmark: No data`);
        } else if (objectTarget) {
            console.log(`String benchmark: No data`);
            console.log(`Object benchmark: ${objectTarget.profileStats.totalTime.toFixed(3)}ms (${objectTarget.profileStats.samples} samples)`);
        }
    }
    console.log('\n' + '='.repeat(80) + '\n');
}

/**
 * Displays a detailed table comparing metrics for a single target type.
 */
function displayTargetMetricsComparison(targetType: string, stringTarget: TargetBenchmarkData, objectTarget: TargetBenchmarkData) {
    const stringMap = new Map(stringTarget.deltaMetrics.map(m => [m.name, m.value]));
    const objectMap = new Map(objectTarget.deltaMetrics.map(m => [m.name, m.value]));
    const allMetricNames = new Set([...stringMap.keys(), ...objectMap.keys()]);

    if (allMetricNames.size === 0) {
        console.log(`No performance metrics available for ${targetType}`);
        return;
    }

    const tableData: Array<{ metric: string; string: string; object: string; difference: string; change: string; }> = [];

    for (const metricName of allMetricNames) {
        const stringValue = stringMap.get(metricName) || 0;
        const objectValue = objectMap.get(metricName) || 0;
        const difference = objectValue - stringValue;
        const percentChange = stringValue !== 0 ? ((difference / stringValue) * 100) : 0;

        const formatValue = (value: number, metric: string): string => {
            if (metric.toLowerCase().includes('time') || metric.toLowerCase().includes('duration')) return `${value.toFixed(3)}ms`;
            if (metric.toLowerCase().includes('bytes') || metric.toLowerCase().includes('size')) return `${(value / 1024).toFixed(2)}KB`;
            return value.toFixed(3);
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

    console.log(`\n🔍 ${targetType} Performance Metrics:`);
    console.log('| Metric'.padEnd(35) + '| String'.padEnd(15) + '| Object'.padEnd(15) + '| Difference'.padEnd(15) + '| Change'.padEnd(12) + '|');
    console.log('|' + '-'.repeat(34) + '|' + '-'.repeat(14) + '|' + '-'.repeat(14) + '|' + '-'.repeat(14) + '|' + '-'.repeat(11) + '|');
    for (const row of tableData) {
        console.log('| ' + row.metric.padEnd(33) + '| ' + row.string.padEnd(13) + '| ' + row.object.padEnd(13) + '| ' + row.difference.padEnd(13) + '| ' + row.change.padEnd(10) + '|');
    }
}


/**
 * Calculates the delta between two sets of performance metrics.
 */
function calculateMetricDeltas(beforeMetrics: Metric[], afterMetrics: Metric[]): Metric[] {
    const deltaMetrics: Metric[] = [];
    const beforeMap = new Map(beforeMetrics.map((m: Metric) => [m.name, m.value]));

    for (const afterMetric of afterMetrics) {
        const beforeValue = beforeMap.get(afterMetric.name) || 0;
        const delta = afterMetric.value - beforeValue;
        if (delta !== 0) {
            deltaMetrics.push({ name: afterMetric.name, value: delta });
        }
    }
    return deltaMetrics;
}

interface ViteServer {
    port: number;
    close: () => void;
}

function startViteServer(): Promise<ViteServer> {
    return new Promise((resolve, reject) => {
        const vite = spawn('npx', ['vite', '--config', 'benchmark/vite.config.ts'], {
            stdio: 'pipe',
            cwd: dirname(__dirname)
        });

        let resolved = false;

        vite.stdout.on('data', (data) => {
            const output = data.toString();
            const localMatch = output.match(/Local:\s+http:\/\/localhost:(\d+)/);
            if (localMatch && !resolved) {
                const port = parseInt(localMatch[1], 10);
                console.log(`Vite server started on port ${port}`);
                resolved = true;
                resolve({ port, close: () => vite.kill() });
            }
        });

        vite.stderr.on('data', (data) => console.error('Vite error:', data.toString()));
        vite.on('error', (error) => !resolved && (resolved = true, reject(error)));
        vite.on('close', (code) => !resolved && code !== 0 && (resolved = true, reject(new Error(`Vite process exited with code ${code}`))));
        setTimeout(() => !resolved && (resolved = true, reject(new Error('Timeout waiting for Vite server to start'))), 30000);
    });
}

/**
 * Starts profiling on a single target (main page or worker).
 * @param session The CDPSession for the target.
 * @param targetId A unique identifier for the target.
 * @param targetType The type of target (e.g., 'main', 'lsp-worker').
 * @returns Initial metrics and data structure for the target.
 */
async function startTargetBenchmark(
    session: CDPSession,
    targetId: string,
    targetType: string
): Promise<{ beforeMetrics: Metric[]; beforeHeap: { used: number; total: number }; targetData: TargetBenchmarkData }> {

    let beforeMetrics: Metric[] = [];
    let beforeHeap = { used: 0, total: 0 };

    // Enable performance metrics only if the target supports it (e.g. 'page', 'iframe')
    if (targetType === 'main' || targetType === 'iframe') {
        try {
            await session.send("Performance.enable");
            const perf = await session.send("Performance.getMetrics");
            beforeMetrics = perf.metrics || [];
        } catch (err) {
            console.warn(`⚠️ Performance metrics not available for ${targetType} (${targetId})`);
        }
    }

    // Heap usage is available for all execution contexts
    try {
        const heap = await session.send("Runtime.getHeapUsage");
        beforeHeap.used = heap.usedSize || 0;
        beforeHeap.total = heap.totalSize || 0;
    } catch (err) {
        console.warn(`⚠️ Heap usage not available for ${targetType} (${targetId})`);
    }

    await session.send("Profiler.enable");
    await session.send("Profiler.start");

    const targetData: TargetBenchmarkData = {
        targetId,
        targetType,
        deltaMetrics: [],
        profileStats: { totalTime: 0, samples: 0, nodes: 0 },
        heapUsage: { usedBytesDelta: 0, totalBytesDelta: 0 }
    };
    return { beforeMetrics, beforeHeap, targetData };
}

/**
 * Stops profiling on a single target and calculates the final metrics.
 * @param session The CDPSession for the target.
 * @param targetData The initial data structure for the target.
 * @param beforeMetrics The performance metrics captured before the test.
 * @returns The completed benchmark data for the target.
 */
async function stopTargetBenchmark(
    session: CDPSession,
    targetData: TargetBenchmarkData,
    beforeMetrics: Metric[],
    beforeHeap: { used: number; total: number }
): Promise<TargetBenchmarkData> {
    let profile: Profiler.StopReturnType | null = null;
    let afterMetrics: Metric[] = [];
    let afterHeap = { used: 0, total: 0 };

    try {
        profile = await session.send('Profiler.stop');
    } catch (error) {
        console.warn(`⚠️ Failed to stop profiler for target ${targetData.targetType} (${targetData.targetId}):`, error);
    }

    // Only get performance metrics if we had them at start
    if (beforeMetrics.length > 0) {
        try {
            const perf = await session.send("Performance.getMetrics");
            afterMetrics = perf.metrics || [];
        } catch (error) {
            console.warn(`⚠️ Failed to get final metrics for target ${targetData.targetType} (${targetData.targetId}):`, error);
        }
    }

    try {
        const heap = await session.send("Runtime.getHeapUsage");
        afterHeap.used = heap.usedSize || 0;
        afterHeap.total = heap.totalSize || 0;
    } catch (error) {
        console.warn(`⚠️ Failed to get heap usage for target ${targetData.targetType} (${targetData.targetId}):`, error);
    }

    let totalTime = 0, samples = 0, nodes = 0;
    if (profile?.profile) {
        nodes = profile.profile.nodes?.length ?? 0;
        samples = profile.profile.samples?.length ?? 0;
        if ((profile.profile.timeDeltas?.length || 0) > 0) {
            totalTime = profile.profile.timeDeltas!.reduce((sum: number, delta: number) => sum + delta, 0) / 1000;
        }
    }

    const deltaMetrics = beforeMetrics.length > 0
        ? calculateMetricDeltas(beforeMetrics, afterMetrics)
        : [];

    const usedBytesDelta = afterHeap.used - beforeHeap.used;
    const totalBytesDelta = afterHeap.total - beforeHeap.total;

    return {
        ...targetData,
        deltaMetrics,
        profileStats: { totalTime, samples, nodes },
        heapUsage: { usedBytesDelta, totalBytesDelta }
    };
}

/**
 * Runs multiple benchmark iterations and returns averaged results.
 * This function now contains the core logic for handling dynamic target discovery.
 */
async function runMultipleBenchmarks(caseName: string, count: number): Promise<AveragedBenchmarkResult> {
    console.log(`\n🚀 Running ${caseName} benchmark ${count} times...`);

    const viteServer = await startViteServer();
    const browser = await chromium.launch({ headless: false });

    try {
        const results: BenchmarkResult[] = [];
        for (let i = 0; i < count; i++) {
            console.log(`\n--- ${caseName} benchmark run ${i + 1}/${count} ---`);

            const browserContext = await browser.newContext();
            const page = await browserContext.newPage();

            const activeTargets = new Map<string, { session: CDPSession; data: { beforeMetrics: Metric[]; beforeHeap: { used: number; total: number }; targetData: TargetBenchmarkData } }>();

            const handleNewTarget = async (session: CDPSession, id: string, type: string, url: string = "") => {
                let targetType = type;
                if (type.indexOf('worker') > -1 && url.includes('lsp.worker')) targetType = 'lsp-worker';
                else if (type.indexOf('worker') > -1 && url.includes('fs.worker')) targetType = 'fs-worker';

                try {
                    const benchmarkData = await startTargetBenchmark(session, id, targetType);
                    activeTargets.set(id, { session, data: benchmarkData });
                    console.log(`✅ Attached to and started profiling target: ${targetType} (${id})`);
                } catch (e) {
                    console.warn(`❌ Could not start profiling for target ${id}:`, e);
                }
            };

            try {
                await page.goto(`http://localhost:${viteServer.port}/index.html`, { timeout: 120000 });
                await page.waitForFunction(() => typeof window.benchmark === 'function', { timeout: 10000 });

                console.log(`Setting up benchmark for case: ${caseName}`);
                await page.evaluate((cn) => (window as any).benchmark(cn), caseName);

                // Create a browser-level session once for this context
                const browserSession = await browser.newBrowserCDPSession();

                const { targetInfos } = await browserSession.send('Target.getTargets');

                for (const { targetId, type, url } of targetInfos) {
                    // Ignore the top-level browser and other unrelated targets
                    if (type === 'browser') continue;

                    try {
                        // Attach to the target and get its own sessionId
                        const { sessionId } = await browserSession.send('Target.attachToTarget', {
                            targetId,
                            flatten: true
                        });

                        // Wrap sending commands to this target in a helper
                        const targetSession: CDPSession = {
                            send: (method, params?: any) =>
                                browserSession.send(method, { ...params, sessionId })
                        } as any;

                        await handleNewTarget(targetSession, targetId, type, url);
                    } catch (e) {
                        console.warn(`❌ Could not attach to target ${targetId}:`, e);
                    }
                }


                const context = new BenchmarkContext(page);
                const startTime = performance.now();
                for (const sim of simulations) {
                    await context.setStatusText(`Running ${sim.name} actions...`);
                    await sim.fn(context);
                }
                const endTime = performance.now();
                const executionTime = endTime - startTime;

                console.log(`Benchmark completed, stopping profiling on ${activeTargets.size} targets...`);

                const finalTargets: TargetBenchmarkData[] = [];
                for (const [id, { session, data }] of activeTargets.entries()) {
                    const finalData = await stopTargetBenchmark(
                        session,
                        data.targetData,
                        data.beforeMetrics,
                        data.beforeHeap
                    );
                    finalTargets.push(finalData);
                    await session.detach();
                }

                console.log(`Final metrics collected from ${finalTargets.length} targets.`);
                results.push({ caseName, executionTime, targets: finalTargets });

            } finally {
                await browserContext.close();
            }
        }

        const averaged = averageBenchmarkResults(results);
        console.log(`\n✅ Completed ${count} runs of ${caseName} benchmark. Average execution time: ${averaged.executionTime.toFixed(3)}ms`);
        return averaged;

    } catch (error) {
        console.error(`❌ Error during ${caseName} benchmark:`, error);
        throw error;
    } finally {
        await browser.close();
        viteServer.close();
    }
}

async function run(count: number = 3) {
    console.log(`\n🎯 Running benchmarks with ${count} iterations per case...`);
    const stringBenchmark = await runMultipleBenchmarks('string', count);
    const objectBenchmark = await runMultipleBenchmarks('object', count);
    displayBenchmarkComparison(stringBenchmark, objectBenchmark);
}

const benchmarkCount = process.argv[2] ? parseInt(process.argv[2]) : 3;
console.log(`Starting benchmark with ${benchmarkCount} iterations per case...`);
await run(benchmarkCount);
process.exit(0);