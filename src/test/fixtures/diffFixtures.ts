import { UnifiedDiffFile } from '../../services/llm/contextTypes';
import { createMockChangedFile } from './adaptivePipelineFixtures';

function buildFixture(
  changes: UnifiedDiffFile[],
): { changes: UnifiedDiffFile[]; diffText: string } {
  return {
    changes,
    diffText: changes.map((change) => `diff --git a/${change.relativePath} b/${change.relativePath}\n${change.diff ?? ''}`).join('\n\n'),
  };
}

export const smallPatchFixture = buildFixture([
  createMockChangedFile(),
  createMockChangedFile({ relativePath: 'src/helper.ts', statusLabel: 'added' }),
]);

export const mediumPatchFixture = buildFixture(
  Array.from({ length: 12 }, (_, index) =>
    createMockChangedFile({
      relativePath: `src/feature-${index}.ts`,
      diff: `@@ -0,0 +1,4 @@\n+export function feature${index}() {\n+  return ${index};\n+}\n+`,
    }),
  ),
);

export const largePatchFixture = buildFixture(
  Array.from({ length: 32 }, (_, index) =>
    createMockChangedFile({
      relativePath: `src/large-${index}.ts`,
      diff: `@@ -0,0 +1,6 @@\n+export const large${index} = true;\n+export function calc${index}() {\n+  return ${index};\n+}\n+\n+`,
    }),
  ),
);

export const securityPatchFixture = buildFixture([
  createMockChangedFile({
    relativePath: 'src/auth/tokenService.ts',
    diff: '@@ -1,2 +1,4 @@\n-export const token = "";\n+export function createJwt(apiKey: string) {\n+  return apiKey;\n+}\n+',
  }),
  createMockChangedFile({
    relativePath: 'src/session/password.ts',
    diff: '@@ -1,1 +1,3 @@\n-export const password = "";\n+export const password = process.env.SECRET;\n+export const hash = "sha256";\n+',
  }),
]);

export const refactorPatchFixture = buildFixture([
  createMockChangedFile({
    relativePath: 'src/rename-user-service.ts',
    statusLabel: 'renamed',
    diff: '@@ -1,3 +1,3 @@\n-export class UserService {}\n+export class AccountService {}\n',
  }),
  createMockChangedFile({
    relativePath: 'src/moved/account/helpers.ts',
    statusLabel: 'renamed',
    diff: '@@ -1,3 +1,3 @@\n-export function helper() { return true; }\n+export function helper() { return true; }\n',
  }),
]);
