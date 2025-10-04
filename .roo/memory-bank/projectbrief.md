# Project Brief: Git Mew 🐱

## Project Identity
**Name:** Git Mew  
**Tagline:** Your AI kitty for Git chaos - Generate intelligent commit messages using AI  
**Version:** 0.0.1  
**Type:** VS Code Extension

## Core Purpose
Git Mew is a VS Code extension that automatically generates meaningful, conventional commit messages by analyzing staged Git changes using AI language models (OpenAI, Claude, Gemini).

## Primary Goals
1. **Eliminate commit message writer's block** - Automatically generate descriptive commit messages
2. **Enforce conventional commit standards** - Follow best practices for commit message formatting
3. **Support multiple AI providers** - Give users choice between OpenAI, Claude, and Gemini
4. **Seamless Git integration** - Work directly within VS Code's Source Control panel

## Target Users
- Developers who want to maintain high-quality commit history
- Teams enforcing conventional commit standards
- Developers working with multiple AI providers
- Anyone who struggles with writing descriptive commit messages

## Key Features
- 🤖 AI-powered commit message generation from staged changes
- 🔍 AI-powered merge request/pull request code review
- 🎯 Support for OpenAI (GPT-5, GPT-4.1), Claude (Sonnet 4.5), Gemini (2.5 Pro/Flash), and Ollama
- ⚡ Quick access via sparkle icon in Source Control panel
- 🎨 Conventional commit format with file summaries
- 📝 Comprehensive code review reports with quality assessment
- � Secure API key storage in VS Code secrets
- 🔍 Advanced binary file detection using FileTypeDetector
- 🌍 Multi-language support for code reviews
- 📋 Custom commit and review rules via `.gitmew/` configuration files

## Technical Scope
- **Platform:** VS Code Extension (requires VS Code 1.104.0+)
- **Language:** TypeScript
- **Dependencies:** Git, VS Code API, LLM provider APIs
- **Architecture:** Modular adapter pattern for LLM providers

## Success Criteria
- Users can generate commit messages with one click
- Messages follow conventional commit format
- Support for all three major LLM providers works reliably
- API keys are stored securely
- Binary files are properly detected and handled
- Extension integrates seamlessly with Git SCM panel

## Out of Scope (Current Version)
- Automatic staging of files
- Commit history analysis
- Custom commit message templates
- Multi-repository support
- Offline mode