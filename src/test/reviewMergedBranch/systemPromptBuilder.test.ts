// Feature: review-merged-branch-agent-plan, Property 7
// **Validates: Requirements 8.4**

import * as assert from 'assert';
import * as fc from 'fast-check';
import { SYSTEM_PROMPT_GENERATE_REVIEW_MERGE } from '../../prompts/systemPromptGenerateReviewMerge';

suite('Property 7: Custom prompts are injected into system message', () => {

    test('all three custom prompt strings appear in the generated system message', () => {
        fc.assert(
            fc.property(
                fc.string({ minLength: 1 }),
                fc.string({ minLength: 1 }),
                fc.string({ minLength: 1 }),
                (customSystem, customRules, customAgent) => {
                    const result = SYSTEM_PROMPT_GENERATE_REVIEW_MERGE(
                        'English',
                        customSystem,
                        customRules,
                        customAgent
                    );

                    assert.ok(
                        result.includes(customSystem),
                        'result should contain customSystemPrompt'
                    );
                    assert.ok(
                        result.includes(customRules),
                        'result should contain customRules'
                    );
                    assert.ok(
                        result.includes(customAgent),
                        'result should contain customAgentInstructions'
                    );
                }
            ),
            { numRuns: 150 }
        );
    });
});
