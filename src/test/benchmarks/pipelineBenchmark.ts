import {
  getLegacyBaselineDirectory,
  runAllComparisons,
  writeLegacyBaselines,
} from './benchmarkHarness';

function main(): void {
  const comparisons = runAllComparisons();
  const shouldWriteBaseline = process.argv.includes('--write-baseline');

  if (shouldWriteBaseline) {
    writeLegacyBaselines(getLegacyBaselineDirectory(), comparisons);
  }

  process.stdout.write(`${JSON.stringify({
    generatedAt: new Date().toISOString(),
    wroteLegacyBaseline: shouldWriteBaseline,
    comparisons,
  }, null, 2)}\n`);
}

main();
