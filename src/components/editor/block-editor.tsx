'use client';
import dynamic from 'next/dynamic';
import { Plus, Trash2 } from 'lucide-react';
import type { LessonBlock } from '@/lib/schemas';
import { videoProviders, type VideoProvider } from '@/lib/video';
import { Button, Field, Input } from '../ui';
import { Uploader } from '../uploader';
import { UploadedVideoChoice } from '../video-management';
const RichEditor = dynamic(() => import('./rich-editor'), {
  ssr: false,
  loading: () => <div className="skeleton rich-skeleton" />,
});
export const blockLabels: Record<LessonBlock['type'], string> = {
  heading: 'Заголовок',
  rich_text: 'Текст',
  image: 'Изображение',
  video: 'Видео',
  file: 'Файл',
  link: 'Ссылка',
  quote: 'Цитата',
  callout: 'Акцент',
  divider: 'Разделитель',
  code: 'Код',
  gallery: 'Галерея',
};
export function newBlock(type: LessonBlock['type']): LessonBlock {
  const base = { id: crypto.randomUUID(), version: 1 as const };
  switch (type) {
    case 'heading':
      return { ...base, type, data: { text: 'Новый заголовок', level: 2 } };
    case 'rich_text':
      return {
        ...base,
        type,
        data: { document: { type: 'doc', content: [{ type: 'paragraph' }] } },
      };
    case 'image':
      return { ...base, type, data: { assetId: '', alt: '', caption: '' } };
    case 'video':
      return { ...base, type, data: { provider: 'upload', assetId: '', title: 'Видео к уроку' } };
    case 'file':
      return { ...base, type, data: { assetId: '', label: 'Материал к уроку' } };
    case 'link':
      return { ...base, type, data: { url: '', label: 'Полезная ссылка' } };
    case 'quote':
      return { ...base, type, data: { text: 'Важная мысль', author: '' } };
    case 'callout':
      return { ...base, type, data: { text: 'Обратите внимание', tone: 'info' } };
    case 'divider':
      return { ...base, type, data: {} };
    case 'code':
      return { ...base, type, data: { code: '', language: 'text' } };
    case 'gallery':
      return { ...base, type, data: { items: [] } };
  }
}
type MediaOption = { id: string; filename: string; mime_type: string };
function AssetField({
  value,
  onChange,
  imagesOnly,
  media,
}: {
  value: string;
  onChange: (id: string, name: string) => void;
  imagesOnly?: boolean;
  media: MediaOption[];
}) {
  return (
    <div className="form-stack">
      <select
        className="input"
        aria-label={imagesOnly ? 'Изображение из медиатеки' : 'Файл из медиатеки'}
        value={value}
        onChange={(e) => {
          const asset = media.find((m) => m.id === e.target.value);
          if (asset) onChange(asset.id, asset.filename);
        }}
      >
        <option value="">Выбрать из медиатеки</option>
        {media
          .filter((m) => !imagesOnly || m.mime_type.startsWith('image/'))
          .map((m) => (
            <option key={m.id} value={m.id}>
              {m.filename}
            </option>
          ))}
      </select>
      <Uploader value={value} onChange={onChange} imagesOnly={imagesOnly} />
    </div>
  );
}
export function BlockEditor({
  block,
  onChange,
  media,
  protectedProviders = [],
}: {
  block: LessonBlock;
  onChange: (block: LessonBlock) => void;
  media: MediaOption[];
  protectedProviders?: ('cloudflare' | 'mux')[];
}) {
  switch (block.type) {
    case 'heading':
      return (
        <div className="form-row">
          <Field label="Текст заголовка">
            <Input
              maxLength={180}
              value={block.data.text}
              onChange={(e) =>
                onChange({ ...block, data: { ...block.data, text: e.target.value } })
              }
            />
          </Field>
          <Field label="Уровень">
            <select
              className="input"
              value={block.data.level}
              onChange={(e) =>
                onChange({
                  ...block,
                  data: { ...block.data, level: Number(e.target.value) as 2 | 3 },
                })
              }
            >
              <option value={2}>Большой заголовок</option>
              <option value={3}>Подзаголовок</option>
            </select>
          </Field>
        </div>
      );
    case 'rich_text':
      return (
        <RichEditor
          value={block.data.document}
          onChange={(document) => onChange({ ...block, data: { document } })}
        />
      );
    case 'image':
      return (
        <div className="form-stack">
          <AssetField
            media={media}
            imagesOnly
            value={block.data.assetId}
            onChange={(assetId) => onChange({ ...block, data: { ...block.data, assetId } })}
          />
          <Field label="Альтернативный текст">
            <Input
              value={block.data.alt}
              maxLength={300}
              onChange={(e) => onChange({ ...block, data: { ...block.data, alt: e.target.value } })}
            />
          </Field>
          <Field label="Подпись">
            <Input
              value={block.data.caption ?? ''}
              maxLength={500}
              onChange={(e) =>
                onChange({ ...block, data: { ...block.data, caption: e.target.value } })
              }
            />
          </Field>
        </div>
      );
    case 'video':
      return (
        <div className="form-stack">
          <div className="form-row">
            <Field label="Источник видео">
              <select
                className="input"
                value={block.data.provider}
                onChange={(e) => {
                  const provider = e.target.value as VideoProvider;
                  onChange({
                    ...block,
                    data:
                      provider === 'upload'
                        ? { provider, assetId: '', title: block.data.title }
                        : provider === 'cloudflare' || provider === 'mux'
                          ? { provider, sourceId: '', title: block.data.title }
                          : { provider, url: '', title: block.data.title },
                  });
                }}
              >
                <option value="upload">Загруженное видео · с надписью</option>
                {videoProviders.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label} · PUBLIC VIDEO
                  </option>
                ))}
                {protectedProviders.map((provider) => (
                  <option key={provider} value={provider}>
                    {provider === 'cloudflare' ? 'Cloudflare Stream' : 'Mux'} · PROTECTED VIDEO
                  </option>
                ))}
                {'sourceId' in block.data && !protectedProviders.includes(block.data.provider) && (
                  <option value={block.data.provider} disabled>
                    {block.data.provider} · не настроен
                  </option>
                )}
              </select>
            </Field>
            <Field label="Название видео">
              <Input
                value={block.data.title}
                maxLength={180}
                onChange={(e) =>
                  onChange({ ...block, data: { ...block.data, title: e.target.value } })
                }
              />
            </Field>
          </div>
          {'assetId' in block.data ? (
            <UploadedVideoChoice
              value={block.data.assetId}
              onChange={(assetId) => {
                if ('assetId' in block.data)
                  onChange({ ...block, data: { ...block.data, assetId } });
              }}
            />
          ) : 'sourceId' in block.data ? (
            <Field
              label="Идентификатор защищённого видео"
              hint="Cloudflare Video UID или Mux signed playback ID. Настройте приватность источника у провайдера."
            >
              <Input
                value={block.data.sourceId}
                maxLength={128}
                autoComplete="off"
                onChange={(e) => {
                  if ('sourceId' in block.data)
                    onChange({
                      ...block,
                      data: { ...block.data, sourceId: e.target.value.trim() },
                    });
                }}
              />
            </Field>
          ) : (
            <Field
              label="Адрес видео"
              hint="HTTPS-ссылка на видео. Для внешнего embed домен должен быть разрешён Admin в настройках."
            >
              <Input
                type="url"
                value={block.data.url}
                onChange={(e) => {
                  if ('url' in block.data)
                    onChange({ ...block, data: { ...block.data, url: e.target.value } });
                }}
                placeholder="https://…"
              />
            </Field>
          )}
          <div className="field-hint">
            {'sourceId' in block.data
              ? 'PROTECTED VIDEO · Сервер проверяет доступ и выдаёт короткое разрешение. Это не DRM.'
              : 'PUBLIC VIDEO · Публичные видеосервисы не защищают поток от копирования. Доступ к уроку проверяется Академией.'}
          </div>
        </div>
      );
    case 'file':
      return (
        <div className="form-stack">
          <AssetField
            media={media}
            value={block.data.assetId}
            onChange={(assetId, label) => onChange({ ...block, data: { assetId, label } })}
          />
          <Field label="Название материала">
            <Input
              value={block.data.label}
              maxLength={180}
              onChange={(e) =>
                onChange({ ...block, data: { ...block.data, label: e.target.value } })
              }
            />
          </Field>
        </div>
      );
    case 'link':
      return (
        <div className="form-stack">
          <Field label="Название ссылки">
            <Input
              value={block.data.label}
              maxLength={180}
              onChange={(e) =>
                onChange({ ...block, data: { ...block.data, label: e.target.value } })
              }
            />
          </Field>
          <Field label="HTTPS-адрес">
            <Input
              type="url"
              value={block.data.url}
              onChange={(e) => onChange({ ...block, data: { ...block.data, url: e.target.value } })}
            />
          </Field>
        </div>
      );
    case 'quote':
      return (
        <div className="form-stack">
          <Field label="Цитата">
            <textarea
              className="input"
              value={block.data.text}
              maxLength={4000}
              onChange={(e) =>
                onChange({ ...block, data: { ...block.data, text: e.target.value } })
              }
            />
          </Field>
          <Field label="Автор">
            <Input
              value={block.data.author}
              maxLength={180}
              onChange={(e) =>
                onChange({ ...block, data: { ...block.data, author: e.target.value } })
              }
            />
          </Field>
        </div>
      );
    case 'callout':
      return (
        <div className="form-stack">
          <Field label="Текст акцента">
            <textarea
              className="input"
              maxLength={4000}
              value={block.data.text}
              onChange={(e) =>
                onChange({ ...block, data: { ...block.data, text: e.target.value } })
              }
            />
          </Field>
          <Field label="Оформление">
            <select
              className="input"
              value={block.data.tone}
              onChange={(e) =>
                onChange({
                  ...block,
                  data: { ...block.data, tone: e.target.value as 'info' | 'success' | 'warning' },
                })
              }
            >
              <option value="info">Информация</option>
              <option value="success">Полезный совет</option>
              <option value="warning">Обратите внимание</option>
            </select>
          </Field>
        </div>
      );
    case 'divider':
      return (
        <div className="editor-divider">
          <hr />
          <span>Визуальная пауза между частями урока</span>
        </div>
      );
    case 'code':
      return (
        <div className="form-stack">
          <Field label="Язык">
            <Input
              value={block.data.language}
              maxLength={30}
              onChange={(e) =>
                onChange({ ...block, data: { ...block.data, language: e.target.value } })
              }
            />
          </Field>
          <Field label="Код">
            <textarea
              className="input code-input"
              spellCheck={false}
              maxLength={20000}
              value={block.data.code}
              onChange={(e) =>
                onChange({ ...block, data: { ...block.data, code: e.target.value } })
              }
            />
          </Field>
        </div>
      );
    case 'gallery':
      return (
        <div className="form-stack">
          {block.data.items.map((item, i) => (
            <div className="gallery-edit-item" key={i}>
              <AssetField
                imagesOnly
                media={media}
                value={item.assetId}
                onChange={(assetId) =>
                  onChange({
                    ...block,
                    data: {
                      items: block.data.items.map((x, j) => (j === i ? { ...x, assetId } : x)),
                    },
                  })
                }
              />
              <Field label={`Описание изображения ${i + 1}`}>
                <Input
                  value={item.alt}
                  onChange={(e) =>
                    onChange({
                      ...block,
                      data: {
                        items: block.data.items.map((x, j) =>
                          j === i ? { ...x, alt: e.target.value } : x,
                        ),
                      },
                    })
                  }
                />
              </Field>
              <Button
                variant="ghost"
                type="button"
                onClick={() =>
                  onChange({
                    ...block,
                    data: { items: block.data.items.filter((_, j) => j !== i) },
                  })
                }
              >
                <Trash2 size={15} />
                Убрать изображение
              </Button>
            </div>
          ))}
          <Button
            variant="secondary"
            type="button"
            disabled={block.data.items.length >= 12}
            onClick={() =>
              onChange({
                ...block,
                data: { items: [...block.data.items, { assetId: '', alt: '' }] },
              })
            }
          >
            <Plus size={16} />
            Добавить изображение
          </Button>
        </div>
      );
  }
}
