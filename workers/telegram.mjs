import { timingSafeEqual } from 'node:crypto';
export function authenticateWebhook(actual, expected) {
  if (!actual || !expected) return false;
  const a = Buffer.from(actual),
    b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
export function telegramUpdate(input) {
  if (!input || typeof input !== 'object') return null;
  const message = input.message ?? input.callback_query?.message,
    from = input.message?.from ?? input.callback_query?.from;
  if (
    !Number.isSafeInteger(input.update_id) ||
    !message ||
    !from ||
    from.is_bot ||
    message.chat?.type !== 'private' ||
    message.chat.id !== from.id ||
    !Number.isSafeInteger(from.id)
  )
    return null;
  const text = String(input.callback_query?.data ?? message.text ?? '').slice(0, 200);
  let command = 'help',
    token,
    course_id;
  if (/^\/start lms_[a-f0-9]{48}$/.test(text)) {
    command = 'link';
    token = text.slice(11);
  } else if (/^course:[a-f0-9-]{36}$/.test(text)) {
    command = 'students';
    course_id = text.slice(7);
  } else {
    const match = text.match(
      /^\/(summary|inactive|completions|students|courses|help|start)(?:@[A-Za-z0-9_]+)?$/,
    );
    if (!match) return null;
    command = match[1] === 'start' ? 'help' : match[1];
  }
  return {
    update_id: input.update_id,
    chat_id: message.chat.id,
    telegram_id: from.id,
    chat_type: 'private',
    command,
    ...(token ? { token } : {}),
    ...(course_id ? { course_id } : {}),
  };
}
export function reportCsv(rows) {
  if (!rows.length) return '\uFEFFНет данных\r\n';
  const headers = Object.keys(rows[0]);
  const cell = (value) => {
    const s = String(value ?? '');
    return '"' + (/^[\s]*[=+@-]/.test(s) ? "'" + s : s).replaceAll('"', '""') + '"';
  };
  return (
    '\uFEFF' +
    [
      headers.map(cell).join(';'),
      ...rows.map((row) => headers.map((h) => cell(row[h])).join(';')),
    ].join('\r\n')
  );
}
export async function telegramCall(token, method, data, { form = false, fetcher = fetch } = {}) {
  let response;
  try {
    response = await fetcher(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: form ? {} : { 'Content-Type': 'application/json' },
      body: form ? data : JSON.stringify(data),
      signal: AbortSignal.timeout(method === 'getUpdates' ? 35000 : 15000),
    });
  } catch {
    throw new Error('DELIVERY_UNKNOWN');
  }
  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error('DELIVERY_UNKNOWN');
  }
  if (!response.ok || body.ok !== true) throw new Error('DELIVERY_FAILED');
  return body.result;
}
export async function deliverReport(
  token,
  job,
  data,
  fetcher = fetch,
  receipt = async () => {},
  authorize = async () => null,
) {
  if (!token) throw new Error('NOT_CONFIGURED');
  if (!data.recipients.length) throw new Error('DELIVERY_FAILED');
  const delivered = new Set(job.result?.delivered ?? []);
  for (const recipient of data.recipients) {
    if (delivered.has(recipient.id)) continue;
    const fresh = await authorize(recipient.id);
    if (!fresh || fresh.id !== recipient.id || !Number.isSafeInteger(fresh.chat_id))
      throw new Error('DELIVERY_FAILED');
    recipient.chat_id = fresh.chat_id;
    if (job.payload.report === 'help')
      await telegramCall(
        token,
        'sendMessage',
        {
          chat_id: recipient.chat_id,
          text: 'Академия подключена. Команды:\n/summary — сводка за сутки\n/courses — отчёт по курсу\n/students — таблица прогресса\n/inactive — неактивные ученики\n/completions — завершения за неделю',
          reply_markup: {
            keyboard: [
              [{ text: '/summary' }, { text: '/courses' }],
              [{ text: '/students' }, { text: '/inactive' }],
            ],
            resize_keyboard: true,
          },
        },
        { fetcher },
      );
    else if (job.payload.report === 'summary')
      await telegramCall(
        token,
        'sendMessage',
        {
          chat_id: recipient.chat_id,
          text: `Сводка академии за 24 часа\nНовые пользователи: ${data.report.new}\nАктивные ученики: ${data.report.active}\nЗавершено уроков: ${data.report.lessons}\nОпубликовано курсов: ${data.report.courses}`,
        },
        { fetcher },
      );
    else if (job.payload.report === 'courses')
      await telegramCall(
        token,
        'sendMessage',
        {
          chat_id: recipient.chat_id,
          text: data.report.length ? 'Выберите курс:' : 'Опубликованных курсов пока нет.',
          reply_markup: {
            inline_keyboard: data.report.map((c) => [
              { text: String(c.title).slice(0, 80), callback_data: `course:${c.id}` },
            ]),
          },
        },
        { fetcher },
      );
    else {
      const form = new FormData();
      form.append('chat_id', String(recipient.chat_id));
      form.append(
        'caption',
        job.payload.report === 'inactive'
          ? 'Ученики без активности 7 дней'
          : job.payload.report === 'completions'
            ? 'Курсы, завершённые за неделю'
            : 'Прогресс учеников',
      );
      form.append(
        'document',
        new Blob([reportCsv(data.report)], { type: 'text/csv;charset=utf-8' }),
        'academy-report.csv',
      );
      await telegramCall(token, 'sendDocument', form, { form: true, fetcher });
    }
    delivered.add(recipient.id);
    try {
      await receipt(recipient.id);
    } catch {
      throw new Error('DELIVERY_UNKNOWN');
    }
  }
  return { delivered: [...delivered], rows: Array.isArray(data.report) ? data.report.length : 1 };
}
