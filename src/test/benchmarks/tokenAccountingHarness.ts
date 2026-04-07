import { runAllComparisons, summarizeTokenAccounting } from './benchmarkHarness';

function main(): void {
  const comparisons = runAllComparisons();
  const summary = summarizeTokenAccounting(comparisons);

  process.stdout.write(`${JSON.stringify({
    generatedAt: new Date().toISOString(),
    summary,
  }, null, 2)}\n`);
}

main();
