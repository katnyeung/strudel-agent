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
    async chat(systemPrompt, messages, maxTokens = 4096) {
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
  const isOllama = config.provider.toLowerCase() === 'ollama';

  return {
    provider: config.provider,
    async chat(systemPrompt, messages, maxTokens = 2048) {
      const allMessages: Array<{ role: string; content: string }> = [
        { role: 'system', content: systemPrompt },
        ...messages,
      ];

      // For Qwen thinking models on Ollama: disable thinking by prefilling
      // an empty <think> block so the model skips internal reasoning chain
      if (isOllama) {
        allMessages.push({ role: 'assistant', content: '<think>\n</think>\n' });
      }

      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (config.apiKey) headers['authorization'] = `Bearer ${config.apiKey}`;

      // Ollama/Qwen coding params: lower temp, no presence penalty, capped output
      const temperature = isOllama ? 0.6 : 0.85;
      const body: Record<string, unknown> = {
        model: config.model,
        messages: allMessages,
        max_tokens: maxTokens,
        temperature,
      };
      // Reduce context window for faster inference on local models
      if (isOllama) {
        body.num_ctx = 8192;
      }

      if (isOllama) {
        const promptChars = allMessages.reduce((n, m) => n + m.content.length, 0);
        console.log(`[llm] → ollama | model: ${config.model} | msgs: ${allMessages.length} | ~${promptChars} chars | max_tokens: ${maxTokens} | temp: ${temperature} | num_ctx: ${body.num_ctx}`);
      }

      const t0 = Date.now();
      const res = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`${config.provider} ${res.status}: ${err}`);
      }

      if (isOllama) {
        console.log(`[llm] ← ollama | ${Date.now() - t0}ms`);
      }

      const data = await res.json() as any;
      let content = data.choices[0]?.message?.content ?? '';
      // Strip any leftover <think>...</think> blocks from thinking models
      content = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
      return content;
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
    case 'xai': return 'https://api.x.ai';
    default: return 'http://localhost:4000';
  }
}
