import { measureRendererLatency } from './benchmarkHarness';

function main(): void {
  const iterationsArg = process.argv.find((arg) => arg.startsWith('--iterations='));
  const iterations = iterationsArg ? Number(iterationsArg.split('=')[1]) : 250;
  const results = measureRendererLatency(Number.isFinite(iterations) && iterations > 0 ? iterations : 250);

  process.stdout.write(`${JSON.stringify({
    generatedAt: new Date().toISOString(),
    iterations,
    ...results,
  }, null, 2)}\n`);
}

main();
