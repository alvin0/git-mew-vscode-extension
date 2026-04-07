import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

export function assertMarkdownSnapshot(actual: string, snapshotPath: string): void {
  if (!fs.existsSync(snapshotPath)) {
    updateSnapshot(snapshotPath, actual);
  }

  const expected = fs.readFileSync(snapshotPath, 'utf8');
  assert.strictEqual(actual, expected);
}

export function updateSnapshot(snapshotPath: string, content: string): void {
  fs.mkdirSync(path.dirname(snapshotPath), { recursive: true });
  fs.writeFileSync(snapshotPath, content, 'utf8');
}
