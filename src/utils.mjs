import * as z from 'zod/v4';

export function numberFromEnv(name, fallback, min, max) {
  const value = Number.parseInt(process.env[name] ?? '', 10);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

export function unwrap(value) {
  return value && typeof value === 'object' && Object.hasOwn(value, 'result')
    ? value.result
    : value;
}

export function listFields(value) {
  return Array.isArray(value) ? value : [];
}

export function safeString(value) {
  return typeof value === 'string' ? value : undefined;
}

export function risonValue(value) {
  if (/^[A-Za-z0-9_./~-]+$/.test(value)) return value;
  return `'${value.replace(/!/g, '!!').replace(/'/g, "!'")}'`;
}

export function ownerSummary(owners, currentUserId) {
  const normalized = listFields(owners).map((owner) => {
    if (typeof owner === 'number' || typeof owner === 'string') {
      return { id: owner, name: undefined };
    }
    const firstName = safeString(owner?.first_name)?.trim();
    const lastName = safeString(owner?.last_name)?.trim();
    const fullName = [firstName, lastName].filter(Boolean).join(' ');
    return { id: owner?.id, name: fullName || undefined };
  });
  const isMine = currentUserId === null
    ? null
    : normalized.some((owner) => String(owner.id) === String(currentUserId));
  const ownership = normalized.length === 0
    ? 'unassigned'
    : isMine === null
      ? 'unknown'
      : isMine
        ? (normalized.length > 1 ? 'mine_and_others' : 'mine')
        : 'others';
  return { ownership, owned_by_current_user: isMine, owners: normalized };
}

export function tokenSubject(token) {
  try {
    const payload = token.split('.')[1]?.replace(/-/g, '+').replace(/_/g, '/');
    if (!payload) return null;
    const decoded = Buffer.from(payload, 'base64').toString('utf8');
    const claims = JSON.parse(decoded);
    const subject = claims.sub ?? claims.user_id ?? claims.identity;
    return typeof subject === 'string' || typeof subject === 'number' ? String(subject) : null;
  } catch {
    return null;
  }
}

export const pageSchema = z.object({
  page: z.number().int().min(0).default(0),
  page_size: z.number().int().min(1).max(200).default(25),
  search: z.string().trim().max(100).optional(),
});

export function toolResult(value) {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] };
}

export function toolError(error) {
  const message = error instanceof Error ? error.message : 'Unknown Superset error';
  return { isError: true, content: [{ type: 'text', text: message }] };
}

export function registerReadTool(server, name, description, inputSchema, handler) {
  server.registerTool(name, {
    description,
    inputSchema,
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async (input) => {
    try {
      return toolResult(await handler(input));
    } catch (error) {
      return toolError(error);
    }
  });
}

export function registerWriteTool(server, name, description, inputSchema, handler, { destructive = false } = {}) {
  server.registerTool(name, {
    description,
    inputSchema,
    annotations: {
      readOnlyHint: false,
      destructiveHint: destructive,
      idempotentHint: false,
      openWorldHint: false,
    },
  }, async (input) => {
    try {
      return toolResult(await handler(input));
    } catch (error) {
      return toolError(error);
    }
  });
}
