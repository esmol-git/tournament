import type { Request } from 'express';

const MAX_SNAPSHOT_CHARS = 8192;

const REDACT_HEADER_NAMES = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
]);

function truncate(text: string): string {
  if (text.length <= MAX_SNAPSHOT_CHARS) {
    return text;
  }
  return `${text.slice(0, MAX_SNAPSHOT_CHARS)}\n…(truncated)`;
}

/** Тело запроса в виде строки для журнала (без потоков). */
export function serializeAuditRequestBody(body: unknown): string | null {
  if (body === undefined || body === null) {
    return null;
  }
  try {
    if (typeof body === 'string') {
      return truncate(body);
    }
    if (Buffer.isBuffer(body)) {
      return truncate(body.toString('utf8'));
    }
    if (typeof body === 'object') {
      return truncate(JSON.stringify(body));
    }
    return truncate(String(body));
  } catch {
    return '[unserializable body]';
  }
}

export function serializeAuditRequestHeaders(
  raw: Request['headers'] | undefined,
): string | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const out: Record<string, string | string[] | undefined> = {};
  for (const [k, v] of Object.entries(raw)) {
    const low = k.toLowerCase();
    if (REDACT_HEADER_NAMES.has(low)) {
      out[k] = '[redacted]';
    } else if (v !== undefined) {
      out[k] = v;
    }
  }
  try {
    return truncate(JSON.stringify(out));
  } catch {
    return null;
  }
}

export function buildAuditRequestSnapshot(req: Request): {
  requestBody: string | null;
  requestHeaders: string | null;
} {
  return {
    requestBody: serializeAuditRequestBody(req.body),
    requestHeaders: serializeAuditRequestHeaders(req.headers),
  };
}
