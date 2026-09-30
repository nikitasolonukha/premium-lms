'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { AcademySettings } from '@/lib/schemas';
import { updateSettings } from '@/lib/actions/content';
import { Button, Field, Input } from './ui';
import { Uploader } from './uploader';
export function SettingsForm({ initial }: { initial: AcademySettings }) {
  const [doc, setDoc] = useState(initial),
    [pending, start] = useTransition(),
    [error, setError] = useState('');
  const router = useRouter();
  return (
    <form
      className="settings-layout"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          setError('');
          const r = await updateSettings(doc);
          if (!r.ok) setError(r.error);
          else {
            toast.success('Настройки сохранены');
            router.refresh();
          }
        });
      }}
    >
      <div className="form-stack">
        <section className="panel form-stack">
          <h2>Лицо академии</h2>
          <Field label="Название академии">
            <Input
              maxLength={180}
              required
              value={doc.brand_name}
              onChange={(e) => setDoc({ ...doc, brand_name: e.target.value })}
            />
          </Field>
          <Field label="Заголовок страницы входа">
            <Input
              maxLength={180}
              required
              value={doc.login_title}
              onChange={(e) => setDoc({ ...doc, login_title: e.target.value })}
            />
          </Field>
          <Field label="Описание страницы входа">
            <textarea
              className="input"
              maxLength={600}
              value={doc.login_description}
              onChange={(e) => setDoc({ ...doc, login_description: e.target.value })}
            />
          </Field>
          <div className="form-row">
            <Field label="Email поддержки">
              <Input
                type="email"
                required
                value={doc.support_email}
                onChange={(e) => setDoc({ ...doc, support_email: e.target.value })}
              />
            </Field>
            <Field label="Акцентный цвет">
              <div className="color-field">
                <Input
                  type="color"
                  value={doc.accent_color}
                  onChange={(e) => setDoc({ ...doc, accent_color: e.target.value })}
                />
                <Input
                  aria-label="HEX-код цвета"
                  value={doc.accent_color}
                  onChange={(e) => setDoc({ ...doc, accent_color: e.target.value })}
                />
              </div>
            </Field>
          </div>
          <Field label="Текст в подвале">
            <Input
              maxLength={300}
              value={doc.footer_text}
              onChange={(e) => setDoc({ ...doc, footer_text: e.target.value })}
            />
          </Field>
          <Field label="Описание для поисковых систем">
            <textarea
              className="input"
              maxLength={300}
              value={doc.seo_description}
              onChange={(e) => setDoc({ ...doc, seo_description: e.target.value })}
            />
          </Field>
        </section>
        <section className="panel form-stack">
          <h2>Социальные ссылки</h2>
          {doc.social_links.map((link, i) => (
            <div className="social-row" key={i}>
              <Input
                aria-label={`Название ссылки ${i + 1}`}
                value={link.label}
                placeholder="Название"
                onChange={(e) =>
                  setDoc({
                    ...doc,
                    social_links: doc.social_links.map((x, j) =>
                      i === j ? { ...x, label: e.target.value } : x,
                    ),
                  })
                }
              />
              <Input
                aria-label={`Адрес ссылки ${i + 1}`}
                type="url"
                value={link.url}
                placeholder="https://…"
                onChange={(e) =>
                  setDoc({
                    ...doc,
                    social_links: doc.social_links.map((x, j) =>
                      i === j ? { ...x, url: e.target.value } : x,
                    ),
                  })
                }
              />
              <button
                type="button"
                className="icon-button"
                aria-label={`Удалить ссылку ${i + 1}`}
                onClick={() =>
                  setDoc({ ...doc, social_links: doc.social_links.filter((_, j) => j !== i) })
                }
              >
                <Trash2 size={17} />
              </button>
            </div>
          ))}
          <Button
            variant="secondary"
            type="button"
            className="align-start"
            disabled={doc.social_links.length >= 6}
            onClick={() =>
              setDoc({ ...doc, social_links: [...doc.social_links, { label: '', url: '' }] })
            }
          >
            <Plus size={16} />
            Добавить ссылку
          </Button>
        </section>
        <section className="panel form-stack">
          <h2>Защита учебных материалов</h2>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={doc.content_watermark_enabled}
              onChange={(e) => setDoc({ ...doc, content_watermark_enabled: e.target.checked })}
            />
            <span>
              Персональный водяной знак
              <small>
                Показывать идентификатор зрителя на изображениях и поверх плеера. Водяной знак не
                защищает скачанные файлы и не является DRM.
              </small>
            </span>
          </label>
          <Field
            label="Разрешённые домены внешних плееров"
            hint="Один HTTPS-origin на строку, без пути. Например: https://video.example.com"
          >
            <textarea
              className="input"
              defaultValue={doc.embed_origins.join('\n')}
              onBlur={(e) =>
                setDoc({
                  ...doc,
                  embed_origins: e.target.value
                    .split('\n')
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
            />
          </Field>
        </section>
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
        <Button type="submit" busy={pending} className="align-start">
          <Save size={17} />
          Сохранить настройки
        </Button>
      </div>
      <aside className="form-stack">
        <section className="panel form-stack">
          <h2>Логотип</h2>
          <Uploader
            value={doc.logo_asset_id}
            purpose="branding"
            imagesOnly
            onChange={(logo_asset_id) => setDoc({ ...doc, logo_asset_id })}
          />
          {doc.logo_asset_id && (
            <Button
              variant="ghost"
              type="button"
              onClick={() => setDoc({ ...doc, logo_asset_id: null })}
            >
              Использовать стандартный
            </Button>
          )}
        </section>
        <section className="panel form-stack">
          <h2>Иконка сайта</h2>
          <p className="field-hint">Квадратное изображение PNG или WebP, от 64 × 64 px.</p>
          <Uploader
            value={doc.favicon_asset_id}
            purpose="branding"
            imagesOnly
            onChange={(favicon_asset_id) => setDoc({ ...doc, favicon_asset_id })}
          />
          {doc.favicon_asset_id && (
            <Button
              variant="ghost"
              type="button"
              onClick={() => setDoc({ ...doc, favicon_asset_id: null })}
            >
              Использовать стандартную
            </Button>
          )}
        </section>
      </aside>
    </form>
  );
}
