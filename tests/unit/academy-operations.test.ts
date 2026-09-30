import { describe, it, expect } from 'vitest';
import { parseCsv, rowsFromTable, ruleSchema, csvCell } from '../../src/lib/operations';
import {
  telegramUpdate,
  authenticateWebhook,
  reportCsv,
  deliverReport,
} from '../../workers/telegram.mjs';
describe('Student import boundary', () => {
  it('reads Cyrillic BOM and multiline quoted names', () => {
    expect(
      rowsFromTable(
        parseCsv('\uFEFFпочта;имя;фамилия\r\nA@example.com;"Анна\nМария";"Иванова;Петрова"'),
      ),
    ).toEqual([
      { email: 'a@example.com', first_name: 'Анна\nМария', last_name: 'Иванова;Петрова' },
    ]);
  });
  it('rejects ambiguous quotes, duplicate headers and excessive rows', () => {
    for (const csv of ['email,name\n"a"x,b', 'email,name\n"a,b', 'email,name\na"b,c'])
      expect(() => parseCsv(csv)).toThrow();
    expect(() =>
      rowsFromTable([
        ['email', 'почта', 'имя'],
        ['a', 'b', 'c'],
      ]),
    ).toThrow();
    expect(() =>
      rowsFromTable([['email', 'first_name'], ...Array(501).fill(['a', 'b'])]),
    ).toThrow();
    expect(() => parseCsv('a,b\n' + 'a'.repeat(1001))).toThrow();
  });
  it('escapes spreadsheet formula payloads', () => {
    expect(csvCell(' =HYPERLINK("x")')).toBe('"\' =HYPERLINK(""x"")"');
    expect(reportCsv([{ email: '@attack', name: 'Иван' }])).toContain("'@attack");
  });
  it('requires recipients and bounded schedule', () => {
    expect(
      ruleSchema.safeParse({
        name: 'Отчёт',
        kind: 'summary',
        frequency: 'daily',
        enabled: true,
        hour: 24,
        minute: 0,
        weekday: 1,
        timezone: 'Europe/Moscow',
        recipients: [],
      }).success,
    ).toBe(false);
  });
});
describe('Telegram trust boundary', () => {
  const update = (text: string) => ({
    update_id: 1,
    message: { from: { id: 99 }, chat: { id: 99, type: 'private' }, text },
  });
  it('accepts only private whitelisted commands', () => {
    expect(telegramUpdate(update('/summary'))?.command).toBe('summary');
    expect(
      telegramUpdate({
        ...update('/summary'),
        message: { ...update('/summary').message, chat: { id: 98, type: 'private' } },
      }),
    ).toBe(null);
    expect(
      telegramUpdate({
        ...update('/summary'),
        message: { ...update('/summary').message, chat: { id: 99, type: 'group' } },
      }),
    ).toBe(null);
    expect(telegramUpdate(update('/delete'))).toBe(null);
    expect(telegramUpdate(null)).toBe(null);
  });
  it('uses exact webhook secret comparison and the link token format', () => {
    expect(telegramUpdate(update('/start lms_' + 'a'.repeat(48)))?.token).toBe('a'.repeat(48));
    expect(telegramUpdate(update('/start lms_bad'))).toBe(null);
    expect(authenticateWebhook('secret', 'secret')).toBe(true);
    expect(authenticateWebhook('secret', 'Secret')).toBe(false);
    expect(authenticateWebhook(null, undefined)).toBe(false);
  });
  it('rechecks recipients before sending and warns when a delivered receipt cannot be stored', async () => {
    let sent = 0;
    const transport = async () => {
      sent++;
      return { ok: true, json: async () => ({ ok: true, result: { message_id: 1 } }) };
    };
    const job = { payload: { report: 'summary' }, result: {} },
      data = { report: {}, recipients: [{ id: 'a', chat_id: 11 }] };
    await expect(
      deliverReport(
        'test-token',
        job,
        data,
        transport,
        async () => {},
        async () => {
          throw new Error('REVOKED');
        },
      ),
    ).rejects.toThrow('REVOKED');
    expect(sent).toBe(0);
    await expect(
      deliverReport(
        'test-token',
        job,
        data,
        transport,
        async () => {
          throw new Error('DB_UNAVAILABLE');
        },
        async (id) => ({ id, chat_id: 11 }),
      ),
    ).rejects.toThrow('DELIVERY_UNKNOWN');
    expect(sent).toBe(1);
  });
  it('never sends with missing or inconsistent recipient authorization', async () => {
    let sent = 0;
    const transport = async () => {
      sent++;
      return { ok: true, json: async () => ({ ok: true }) };
    };
    const job = { payload: { report: 'summary' }, result: {} };
    const data = { report: {}, recipients: [{ id: 'a', chat_id: 11 }] };
    await expect(deliverReport('test-token', job, data, transport)).rejects.toThrow(
      'DELIVERY_FAILED',
    );
    await expect(
      deliverReport('test-token', job, data, transport, undefined, async () => ({
        id: 'other',
        chat_id: 11,
      })),
    ).rejects.toThrow('DELIVERY_FAILED');
    expect(sent).toBe(0);
  });
  it('skips confirmed recipients and records delivery acknowledgements', async () => {
    const calls: string[] = [];
    const fetcher = async (_url: unknown, options: unknown) => {
      calls.push(String((options as { body: string }).body));
      return { ok: true, json: async () => ({ ok: true, result: { message_id: 1 } }) };
    };
    const receipts: string[] = [];
    const job = { payload: { report: 'summary' }, result: { delivered: ['a'] } };
    const data = {
      report: { new: 1, active: 2, lessons: 3, courses: 4 },
      recipients: [
        { id: 'a', chat_id: 11 },
        { id: 'b', chat_id: 22 },
      ],
    };
    const authorize = async (id: string) => ({ id, chat_id: 33 });
    await deliverReport(
      'test-token',
      job,
      data,
      fetcher,
      async (id: string) => {
        receipts.push(id);
      },
      authorize,
    );
    expect(calls).toHaveLength(1);
    expect(JSON.parse(calls[0]).chat_id).toBe(33);
    expect(receipts).toEqual(['b']);
    await expect(
      deliverReport(
        'test-token',
        job,
        data,
        async () => {
          throw new Error('network');
        },
        undefined,
        authorize,
      ),
    ).rejects.toThrow('DELIVERY_UNKNOWN');
    await expect(deliverReport('', job, data, fetcher)).rejects.toThrow('NOT_CONFIGURED');
  });
});
