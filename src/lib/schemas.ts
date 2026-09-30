import { z } from 'zod';
import { safeWebUrl } from './video';

export const uuid = z.uuid();
const title = z.string().trim().min(1, 'Введите название').max(180);
const url = z
  .string()
  .max(2048)
  .refine((s) => safeWebUrl(s) !== null, 'Нужен безопасный HTTPS-адрес');
export const passwordSchema = z
  .string()
  .min(12, 'Минимум 12 символов')
  .max(128)
  .regex(/[a-z]/, 'Добавьте строчную букву')
  .regex(/[A-Z]/, 'Добавьте заглавную букву')
  .regex(/\d/, 'Добавьте цифру');
export const credentialsSchema = z
  .object({
    email: z
      .email()
      .max(254)
      .transform((s) => s.toLowerCase().trim()),
    password: z.string().min(1).max(128),
  })
  .strict();
export type RichNode = {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  content?: RichNode[];
};
const richNode: z.ZodType<RichNode> = z.lazy(() =>
  z
    .object({
      type: z.enum([
        'doc',
        'paragraph',
        'text',
        'heading',
        'bulletList',
        'orderedList',
        'listItem',
        'blockquote',
        'codeBlock',
        'hardBreak',
        'horizontalRule',
      ]),
      text: z.string().max(20000).optional(),
      attrs: z
        .object({
          level: z.number().int().min(1).max(3).optional(),
          start: z.number().int().min(1).max(9999).optional(),
          language: z.string().max(30).nullable().optional(),
        })
        .strict()
        .optional(),
      marks: z
        .array(
          z
            .object({
              type: z.enum(['bold', 'italic', 'strike', 'code', 'link', 'underline']),
              attrs: z
                .object({
                  href: url.optional(),
                  target: z.literal('_blank').nullable().optional(),
                  rel: z.string().max(80).nullable().optional(),
                  class: z.null().optional(),
                })
                .strict()
                .optional(),
            })
            .strict(),
        )
        .max(6)
        .optional(),
      content: z.array(richNode).max(300).optional(),
    })
    .strict(),
);
// Inspect iteratively before Zod descends into untrusted recursive content.
const boundedRichNode = z
  .unknown()
  .superRefine((value, ctx) => {
    const stack: { value: unknown; depth: number }[] = [{ value, depth: 0 }];
    let count = 0;
    while (stack.length) {
      const current = stack.pop()!;
      if (++count > 3000 || current.depth > 24) {
        ctx.addIssue({
          code: 'custom',
          message: 'Текст слишком сложный: сократите вложенность и число элементов',
        });
        return;
      }
      if (
        current.value &&
        typeof current.value === 'object' &&
        'content' in current.value &&
        Array.isArray(current.value.content)
      ) {
        if (current.value.content.length > 300) {
          ctx.addIssue({ code: 'custom', message: 'Слишком много элементов текста' });
          return;
        }
        for (const child of current.value.content)
          stack.push({ value: child, depth: current.depth + 1 });
      }
    }
  })
  .pipe(richNode);
const base = { id: uuid, version: z.literal(1) };
export const videoSourceSchema = z.discriminatedUnion('provider', [
  z
    .object({ provider: z.enum(['youtube', 'vimeo', 'rutube', 'direct', 'external']), url, title })
    .strict(),
  z
    .object({
      provider: z.literal('cloudflare'),
      sourceId: z.string().regex(/^[a-f0-9]{32}$/),
      title,
    })
    .strict(),
  z
    .object({
      provider: z.literal('mux'),
      sourceId: z.string().regex(/^[A-Za-z0-9]{8,128}$/),
      title,
    })
    .strict(),
]);
export const blockSchema = z.discriminatedUnion('type', [
  z.object({
    ...base,
    type: z.literal('heading'),
    data: z.object({ text: title, level: z.union([z.literal(2), z.literal(3)]) }).strict(),
  }),
  z.object({
    ...base,
    type: z.literal('rich_text'),
    data: z.object({ document: boundedRichNode }).strict(),
  }),
  z.object({
    ...base,
    type: z.literal('image'),
    data: z
      .object({ assetId: uuid, alt: z.string().max(300), caption: z.string().max(500).optional() })
      .strict(),
  }),
  z.object({
    ...base,
    type: z.literal('video'),
    data: videoSourceSchema,
  }),
  z.object({
    ...base,
    type: z.literal('file'),
    data: z.object({ assetId: uuid, label: title }).strict(),
  }),
  z.object({ ...base, type: z.literal('link'), data: z.object({ url, label: title }).strict() }),
  z.object({
    ...base,
    type: z.literal('quote'),
    data: z.object({ text: z.string().min(1).max(4000), author: z.string().max(180) }).strict(),
  }),
  z.object({
    ...base,
    type: z.literal('callout'),
    data: z
      .object({ text: z.string().min(1).max(4000), tone: z.enum(['info', 'success', 'warning']) })
      .strict(),
  }),
  z.object({ ...base, type: z.literal('divider'), data: z.object({}).strict() }),
  z.object({
    ...base,
    type: z.literal('code'),
    data: z.object({ code: z.string().max(20000), language: z.string().max(30) }).strict(),
  }),
  z.object({
    ...base,
    type: z.literal('gallery'),
    data: z
      .object({
        items: z
          .array(z.object({ assetId: uuid, alt: z.string().max(300) }).strict())
          .min(1)
          .max(12),
      })
      .strict(),
  }),
]);
export type LessonBlock = z.infer<typeof blockSchema>;
export const lessonSchema = z
  .object({
    id: uuid,
    slug: z.string().regex(/^[a-z0-9][a-z0-9-]{0,99}$/),
    title,
    duration: z.number().int().min(0).max(1440),
    published: z.boolean(),
    blocks: z.array(blockSchema).max(100),
  })
  .strict();
export const moduleSchema = z
  .object({ id: uuid, title, lessons: z.array(lessonSchema).max(200) })
  .strict();
export const courseSchema = z
  .object({
    id: uuid,
    version: z.number().int().min(0),
    slug: z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/),
    title,
    description: z.string().max(12000),
    summary: z.string().max(400),
    author: z.string().max(180),
    categoryId: uuid.nullable(),
    tags: z.array(z.string().trim().min(1).max(40)).max(12),
    coverId: uuid.nullable(),
    accent: z.enum(['blue', 'lime', 'lilac', 'peach']),
    featured: z.boolean(),
    accessMode: z.enum(['restricted', 'registered']),
    sequential: z.boolean(),
    modules: z.array(moduleSchema).max(100),
  })
  .strict()
  .superRefine((c, ctx) => {
    const ids = [
      ...c.modules.map((m) => m.id),
      ...c.modules.flatMap((m) => m.lessons.flatMap((l) => [l.id, ...l.blocks.map((b) => b.id)])),
    ];
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({ code: 'custom', message: 'Идентификаторы структуры должны быть уникальны' });
    const slugs = c.modules.flatMap((m) => m.lessons.map((l) => l.slug));
    if (new Set(slugs).size !== slugs.length)
      ctx.addIssue({ code: 'custom', message: 'Адреса уроков должны быть уникальны' });
  });
export type CourseDraft = z.infer<typeof courseSchema>;
export const settingsSchema = z
  .object({
    brand_name: title,
    login_title: title,
    login_description: z.string().max(600),
    support_email: z.email().max(254),
    footer_text: z.string().max(300),
    seo_description: z.string().max(300),
    accent_color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    logo_asset_id: uuid.nullable(),
    favicon_asset_id: uuid.nullable(),
    content_watermark_enabled: z.boolean(),
    watermark_mode: z.enum(['email', 'user_id', 'email_and_id']).default('email_and_id'),
    watermark_interval_seconds: z.number().int().min(5).max(120).default(18),
    watermark_opacity: z.number().min(0.15).max(0.65).default(0.28),
    social_links: z.array(z.object({ label: title, url }).strict()).max(6),
    embed_origins: z
      .array(
        url
          .refine(
            (s) => new URL(s).pathname === '/' && !new URL(s).search && !new URL(s).hash,
            'Только origin без пути',
          )
          .transform((s) => new URL(s).origin),
      )
      .max(10),
  })
  .strict();
export type AcademySettings = z.infer<typeof settingsSchema>;
export const defaultSettings: AcademySettings = {
  brand_name: 'Академия',
  login_title: 'Курсы и материалы вашей академии.',
  login_description:
    'Открывайте уроки, сохраняйте материалы и продолжайте обучение с того места, где остановились.',
  support_email: 'support@example.com',
  footer_text: 'Курсы, уроки и учебные материалы.',
  seo_description: 'Учебные курсы, материалы и прогресс в одном личном кабинете.',
  accent_color: '#3155e7',
  logo_asset_id: null,
  favicon_asset_id: null,
  content_watermark_enabled: false,
  watermark_mode: 'email_and_id',
  watermark_interval_seconds: 18,
  watermark_opacity: 0.28,
  social_links: [],
  embed_origins: [],
};
