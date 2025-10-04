# LLM Adapter

A unified interface for connecting to multiple Large Language Model (LLM) providers using fetch API.

## Supported Providers

- **OpenAI** (GPT-4, GPT-3.5-turbo, etc.)
- **Claude** (Claude 3 Opus, Sonnet, Haiku)
- **Gemini** (Gemini Pro, etc.)

## Installation

The adapters are already included in this project. Simply import them:

```typescript
import { createAdapter, OpenAIAdapter, ClaudeAdapter, GeminiAdapter } from './llm-adapter';
```

## Usage

### Using the Factory Function

```typescript
import { createAdapter, LLMAdapterConfig } from './llm-adapter';

// Create an adapter using the factory
const adapter = createAdapter('openai'); // or 'claude' or 'gemini'

// Initialize with configuration
await adapter.initialize({
  apiKey: 'your-api-key-here',
  model: 'gpt-4', // optional, uses default if not specified
  maxTokens: 2000, // optional
  temperature: 0.7, // optional
  timeout: 30000, // optional, in milliseconds
});

// Generate text
const response = await adapter.generateText('Write a hello world program in Python');
console.log(response.text);
```

### Using Specific Adapters

#### OpenAI

```typescript
import { OpenAIAdapter } from './llm-adapter';

const openai = new OpenAIAdapter();

await openai.initialize({
  apiKey: 'sk-...',
  model: 'gpt-4', // or 'gpt-3.5-turbo'
});

const response = await openai.generateText('Explain quantum computing', {
  maxTokens: 500,
  temperature: 0.8,
  systemMessage: 'You are a helpful physics teacher.',
});

console.log(response.text);
console.log(`Tokens used: ${response.totalTokens}`);
```

#### Claude

```typescript
import { ClaudeAdapter } from './llm-adapter';

const claude = new ClaudeAdapter();

await claude.initialize({
  apiKey: 'sk-ant-...',
  model: 'claude-3-5-sonnet-20241022', // or other Claude models
});

const response = await claude.generateText('Write a poem about coding', {
  maxTokens: 300,
  temperature: 0.9,
  systemMessage: 'You are a creative poet.',
});

console.log(response.text);
```

#### Gemini

```typescript
import { GeminiAdapter } from './llm-adapter';

const gemini = new GeminiAdapter();

await gemini.initialize({
  apiKey: 'your-gemini-api-key',
  model: 'gemini-pro',
});

const response = await gemini.generateText('Explain machine learning', {
  maxTokens: 400,
  temperature: 0.7,
  systemMessage: 'You are an AI expert.',
});

console.log(response.text);
```

## API Reference

### Interface: `ILLMAdapter`

All adapters implement this interface:

#### Methods

- `initialize(config: LLMAdapterConfig): Promise<void>`
  - Initialize the adapter with configuration
  
- `generateText(prompt: string, options?: GenerateOptions): Promise<GenerateResponse>`
  - Generate text from a prompt
  
- `isReady(): boolean`
  - Check if adapter is configured and ready
  
- `getModel(): string`
  - Get the current model name
  
- `testConnection(): Promise<boolean>`
  - Test connection to the LLM service

### Types

#### `LLMAdapterConfig`

```typescript
{
  apiKey: string;           // Required: API key for authentication
  model?: string;           // Optional: Model name
  baseURL?: string;         // Optional: Custom API endpoint
  maxTokens?: number;       // Optional: Max tokens in response
  temperature?: number;     // Optional: 0-1, controls randomness
  timeout?: number;         // Optional: Request timeout in ms
}
```

#### `GenerateOptions`

```typescript
{
  maxTokens?: number;       // Max tokens in response
  temperature?: number;     // 0-1, controls randomness
  stop?: string[];          // Stop sequences
  systemMessage?: string;   // System message for context
}
```

#### `GenerateResponse`

```typescript
{
  text: string;             // Generated text
  model: string;            // Model used
  promptTokens?: number;    // Tokens in prompt
  completionTokens?: number; // Tokens in completion
  totalTokens?: number;     // Total tokens used
  finishReason?: string;    // Why generation stopped
}
```

## Error Handling

```typescript
try {
  const response = await adapter.generateText('Your prompt');
  console.log(response.text);
} catch (error) {
  if (error instanceof Error) {
    console.error('Error:', error.message);
  }
}
```

## Testing Connection

```typescript
const isConnected = await adapter.testConnection();
if (isConnected) {
  console.log('Successfully connected to LLM service');
} else {
  console.log('Failed to connect');
}
```

## Default Models

- **OpenAI**: `gpt-3.5-turbo`
- **Claude**: `claude-3-5-sonnet-20241022`
- **Gemini**: `gemini-pro`

## Notes

- All adapters use native `fetch` API (no external dependencies)
- Requests include timeout protection
- Token usage is tracked when available from the API
- System messages are supported across all providers