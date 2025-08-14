# Benchmark

This directory contains code for benchmarking the performance of the LSP client when the transport uses objects vs. strings.

## Running the benchmark

To run the benchmark, use the following command:

```sh
pnpm benchmark
```

This will execute the benchmark suite and output the results to the console.

## File structure

```sh
.
├── fs.worker.ts # a filesystem worker
├── index.html # benchmark page
├── index.ts # benchmark browser entrypoint
├── lsp.worker.ts # a Typescript LSP worker
├── public
│   └── snapshot.bin
├── results.txt # benchmark results from a local run on my laptop
├── run.ts # benchmark entrypoint, starts puppeteer and uses CDP for profiling
├── simulations.ts # code for simulating various editor user-interactions triggering LSP communication
├── transport.ts # transport implementations
├── utils.ts # nothing of note
└── vite.config.ts # creates a filesystem snapshot (containing Typescript LSP files) to be used by the LSP worker, also serves the benchmark
```