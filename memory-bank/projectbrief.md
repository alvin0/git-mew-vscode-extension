# Project Brief

## Project
Git Mew VS Code extension provides AI-assisted Git workflows, especially commit generation and multi-agent code review for branch diffs, staged changes, and merged branches.

## Primary Goals
- Generate useful review reports from Git diffs inside VS Code.
- Support multiple LLM providers through a shared adapter layer.
- Use multi-agent analysis to improve review depth and reduce missed issues.

## Current Scope Highlights
- Review Merge and Review Staged Changes share a multi-agent orchestration pipeline.
- Review quality enhancement work adds a Security Analyst, structured self-audit, review memory, and phase-3 synthesis agents.

## Constraints
- Must run inside a VS Code extension environment.
- Needs to stay compatible with existing review flows and tests.
- Output should remain markdown-first and user-friendly.
