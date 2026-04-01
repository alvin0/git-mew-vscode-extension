// Feature: review-merged-branch-agent-plan, Property 7
// **Validates: Requirements 8.4**

import * as assert from 'assert';
import * as fc from 'fast-check';
import { SYSTEM_PROMPT_GENERATE_REVIEW_MERGE } from '../../prompts/systemPromptGenerateReviewMerge';

suite('Property 7: Custom prompts are injected into system message', () => {

    test('all three custom prompt strings appear in the generated system message', () => {
        const nonBlankString = () => fc.string({ minLength: 1 }).filter(value => value.trim().length > 0);

        fc.assert(
            fc.property(
                nonBlankString(),
                nonBlankString(),
                nonBlankString(),
                (customSystem, customRules, customAgent) => {
                    const result = SYSTEM_PROMPT_GENERATE_REVIEW_MERGE(
                        'English',
                        customSystem,
                        customRules,
                        customAgent
                    );

                    assert.ok(
                        result.includes(customSystem.trim()),
                        'result should contain customSystemPrompt'
                    );
                    assert.ok(
                        result.includes(customRules.trim()),
                        'result should contain customRules'
                    );
                    assert.ok(
                        result.includes(customAgent.trim()),
                        'result should contain customAgentInstructions'
                    );
                }
            ),
            { numRuns: 150 }
        );
    });

    test('custom system prompt is additive and keeps the default review contract', () => {
        const result = SYSTEM_PROMPT_GENERATE_REVIEW_MERGE(
            'English',
            'Repository-specific guidance',
            'Project rule',
            'Specialized agent guidance'
        );

        assert.ok(
            result.includes('Repository-specific guidance'),
            'result should contain customSystemPrompt'
        );
        assert.ok(
            result.includes('## 3. Detail Change'),
            'result should keep the default review output contract'
        );
        assert.ok(
            result.includes('## Review Agents'),
            'result should keep the default review agent instructions'
        );
    });
});
