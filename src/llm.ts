import type { LlmConfig, ChatMessage } from './types.js';

/**
 * Provider-agnostic LLM gateway.
 * 
 * Supports:
 *  - Anthropic native (/v1/messages)
 *  - OpenAI compatible (/v1/chat/completions) — works with OpenAI, Ollama, LiteLLM, OpenRouter
 * 
 * Usage:
 *   const llm = createLlm(config);
 *   const response = await llm.chat(systemPrompt, messages);
 */

export interface LlmGateway {
  chat(systemPrompt: string, messages: ChatMessage[], maxTokens?: number): Promise<string>;
  provider: string;
}

export function createLlm(config: LlmConfig): LlmGateway {
  const provider = config.provider.toLowerCase();
  console.log(`[llm] provider: ${provider}, model: ${config.model}`);

  if (provider === 'anthropic') {
    return anthropicGateway(config);
  }
  if (provider === 'gemini') {
    return geminiGateway(config);
  }
  return openAiCompatibleGateway(config);
}

// ─── Anthropic Native ─────────────────────────────

function anthropicGateway(config: LlmConfig): LlmGateway {
  return {
    provider: 'anthropic',
    async chat(systemPrompt, messages, maxTokens = 2048) {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': config.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: config.model,
          max_tokens: maxTokens,
          system: systemPrompt,
          messages,
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Anthropic ${res.status}: ${err}`);
      }

      const data = await res.json() as any;
      return data.content[0]?.text ?? '';
    },
  };
}

// ─── Google Gemini Native ─────────────────────────

function geminiGateway(config: LlmConfig): LlmGateway {
  const baseUrl = config.baseUrl || 'https://generativelanguage.googleapis.com';

  return {
    provider: 'gemini',
    async chat(systemPrompt, messages, maxTokens = 2048) {
      const contents = messages.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

      const res = await fetch(
        `${baseUrl}/v1beta/models/${config.model}:generateContent`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-goog-api-key': config.apiKey,
          },
          body: JSON.stringify({
            contents,
            systemInstruction: { parts: [{ text: systemPrompt }] },
            generationConfig: {
              maxOutputTokens: maxTokens,
              temperature: 0.85,
            },
          }),
        },
      );

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Gemini ${res.status}: ${err}`);
      }

      const data = await res.json() as any;
      return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    },
  };
}

// ─── OpenAI Compatible ────────────────────────────

function openAiCompatibleGateway(config: LlmConfig): LlmGateway {
  const baseUrl = resolveBaseUrl(config);

  return {
    provider: config.provider,
    async chat(systemPrompt, messages, maxTokens = 2048) {
      const allMessages = [
        { role: 'system' as const, content: systemPrompt },
        ...messages,
      ];

      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (config.apiKey) headers['authorization'] = `Bearer ${config.apiKey}`;

      const res = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: config.model,
          messages: allMessages,
          max_tokens: maxTokens,
          temperature: 0.85,
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`${config.provider} ${res.status}: ${err}`);
      }

      const data = await res.json() as any;
      return data.choices[0]?.message?.content ?? '';
    },
  };
}

function resolveBaseUrl(config: LlmConfig): string {
  if (config.baseUrl) return config.baseUrl;
  switch (config.provider.toLowerCase()) {
    case 'openai': return 'https://api.openai.com';
    case 'ollama': return 'http://localhost:11434';
    case 'litellm': return 'http://localhost:4000';
    case 'openrouter': return 'https://openrouter.ai/api';
    default: return 'http://localhost:4000';
  }
}
