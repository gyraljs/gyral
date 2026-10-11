import { readFileSync } from 'node:fs';

export const LIMITS = Object.freeze({
  wallMs: 900000,
  requests: 24,
  tools: 60,
  maxOutputTokens: 8192,
  completionTokens: 65536,
  contextTokens: 131072,
  inputBytes: 110000,
  temperature: 0.2,
});

export function credentials(path) {
  const config = JSON.parse(readFileSync(path, 'utf8'));
  const url = new URL(config.baseUrl);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !config.apiKey ||
    config.model !== 'Qwen3.8-27B'
  )
    throw new Error('Invalid provider configuration or unexpected model');
  return config;
}

export function requestBody(model, messages, tools) {
  const body = {
    model,
    messages,
    tools,
    tool_choice: 'auto',
    temperature: LIMITS.temperature,
    max_tokens: LIMITS.maxOutputTokens,
    stream: false,
  };
  if (Buffer.byteLength(JSON.stringify(body)) > LIMITS.inputBytes)
    throw new Error('context_byte_limit');
  return body;
}

export async function complete(config, body, remainingMs) {
  const response = await fetch(`${config.baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    redirect: 'error',
    headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(Math.max(1, Math.min(120000, remainingMs))),
  });
  const raw = await response.text();
  if (raw.includes(config.apiKey))
    throw new Error('Provider response contained a credential; evidence suppressed');
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    data = { invalidJson: raw };
  }
  if (!response.ok) return { ok: false, status: response.status, data };
  if (!data.choices?.[0]?.message || data.model !== config.model)
    return {
      ok: false,
      status: response.status,
      data,
      error: 'Unexpected response or model drift',
    };
  return { ok: true, status: response.status, data };
}

export function usageSummary(responses) {
  const values = (key) => responses.map((response) => response.data.usage?.[key]);
  const total = (key) =>
    values(key).every((value) => typeof value === 'number')
      ? values(key).reduce((sum, value) => sum + value, 0)
      : null;
  return {
    requests: responses.length,
    usageReported: responses.filter((response) => response.data.usage).length,
    promptTokens: total('prompt_tokens'),
    completionTokens: total('completion_tokens'),
    totalTokens: total('total_tokens'),
    costUsd: null,
    costUnavailable:
      'No verified Blueclaw price or billed dollar cost. Owner explicitly authorized unlimited monetary spend. Full provider usage retained per response.',
  };
}
