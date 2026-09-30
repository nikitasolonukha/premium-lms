import type { ErrorEvent } from '@sentry/node';
import { requestId } from './request-security';

const events = ['request.failed', 'action.failed', 'database.failed', 'media.failed', 'playback.failed', 'download.failed', 'readiness.failed', 'monitoring.failed'] as const;
export type ErrorEventName = typeof events[number];
const kinds = ['Error', 'TypeError', 'RangeError', 'SyntaxError', 'AppError', 'ConfigurationError'];
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' ? value as Record<string, unknown> : {};
const kind = (value: unknown) => typeof value === 'string' && kinds.includes(value) ? value : 'ApplicationError';
const eventName = (value: unknown): ErrorEventName => events.includes(value as ErrorEventName) ? value as ErrorEventName : 'request.failed';

export function safeErrorEvent(event: ErrorEventName, error: unknown, correlation?: string | null) {
  return {
    timestamp: new Date().toISOString(), level: 'error' as const,
    event: eventName(event), requestId: requestId(correlation),
    errorKind: kind(error instanceof Error ? error.name : undefined),
  };
}

/** Reconstruct, don't redact in place: new SDK fields cannot silently leak data. */
export function beforeSend(input: unknown): ErrorEvent {
  const event = record(input), tags = record(event.tags);
  const exceptions = record(event.exception).values;
  const first = Array.isArray(exceptions) ? record(exceptions[0]) : {};
  const name = eventName(tags.event);
  return {
    ...(typeof event.event_id === 'string' && /^[a-f0-9]{32}$/.test(event.event_id) ? { event_id: event.event_id } : {}),
    timestamp: typeof event.timestamp === 'number' && Number.isFinite(event.timestamp) ? event.timestamp : Date.now() / 1000,
    platform: 'node', level: 'error', message: name,
    ...(typeof event.environment === 'string' && ['local', 'staging', 'production'].includes(event.environment) ? { environment: event.environment } : {}),
    tags: { request_id: requestId(typeof tags.request_id === 'string' ? tags.request_id : null), event: name },
    exception: { values: [{ type: kind(first.type), value: name }] },
    fingerprint: [name, kind(first.type)],
  };
}
