'use client';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as Dialog from '@radix-ui/react-dialog';
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Copy,
  Eye,
  FileText,
  FolderPlus,
  Layers,
  LoaderCircle,
  Plus,
  Save,
  Send,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import type { CourseDraft, LessonBlock } from '@/lib/schemas';
import { slugify } from '@/lib/domain';
import { saveCourse, publishCourse } from '@/lib/actions/content';
import { Button, Field, Input, Badge, EmptyState } from '../ui';
import { Uploader } from '../uploader';
import { ConfirmDialog } from '../confirm-dialog';
import { SortableList } from './sortable-list';
import { BlockEditor, blockLabels, newBlock } from './block-editor';
type Tab = 'general' | 'modules' | 'lessons' | 'access' | 'settings';
type Lesson = CourseDraft['modules'][number]['lessons'][number];
const tabs: { id: Tab; label: string }[] = [
  { id: 'general', label: 'Основное' },
  { id: 'modules', label: 'Модули' },
  { id: 'lessons', label: 'Уроки' },
  { id: 'access', label: 'Доступ' },
  { id: 'settings', label: 'Настройки' },
];
export default function CourseEditor({
  initial,
  role,
  categories,
  media,
  initialLesson,
  protectedProviders = [],
}: {
  initial: CourseDraft;
  role: string;
  categories: { id: string; name: string }[];
  media: { id: string; filename: string; mime_type: string }[];
  initialLesson?: string;
  protectedProviders?: ('cloudflare' | 'mux')[];
}) {
  const [doc, setDoc] = useState(initial),
    [tab, setTab] = useState<Tab>(initialLesson ? 'lessons' : 'general'),
    [selected, setSelected] = useState<string | undefined>(
      initialLesson ?? initial.modules[0]?.lessons[0]?.id,
    ),
    [status, setStatus] = useState<'saved' | 'dirty' | 'saving' | 'error' | 'conflict'>('saved'),
    [message, setMessage] = useState(''),
    [remote, setRemote] = useState(false),
    [leave, setLeave] = useState<string | null>(null),
    [pending, start] = useTransition();
  const latest = useRef(initial),
    dirty = useRef(false),
    saving = useRef<Promise<number | null> | null>(null),
    changes = useRef(0),
    conflict = useRef(false),
    channel = useRef<BroadcastChannel | null>(null),
    editorHistory = useRef<{ url: string; state: unknown }>({ url: '', state: null });
  const router = useRouter();
  function update(change: (current: CourseDraft) => CourseDraft) {
    const next = change(latest.current);
    latest.current = next;
    dirty.current = true;
    changes.current++;
    setDoc(next);
    if (!conflict.current) setStatus('dirty');
  }
  const persist = useCallback(async (): Promise<number | null> => {
    if (saving.current) return saving.current;
    if (conflict.current) return null;
    if (!dirty.current && latest.current.version > 0) return latest.current.version;
    const snapshot = structuredClone(latest.current),
      atStart = changes.current;
    setStatus('saving');
    setMessage('');
    const operation = (async () => {
      try {
        const result = await saveCourse(snapshot);
        if (!result.ok || !result.data) {
          const isConflict = !result.ok && result.status === 409;
          conflict.current = isConflict;
          setStatus(isConflict ? 'conflict' : 'error');
          setMessage(!result.ok ? result.error : 'Не удалось сохранить курс');
          return null;
        }
        latest.current = { ...latest.current, version: result.data.version };
        dirty.current = changes.current !== atStart;
        setDoc(latest.current);
        setStatus(dirty.current ? 'dirty' : 'saved');
        channel.current?.postMessage({ version: result.data.version });
        if (snapshot.version === 0)
          window.history.replaceState(null, '', `/admin/courses/${snapshot.id}`);
        editorHistory.current = { url: location.href, state: window.history.state };
        return result.data.version;
      } catch {
        setStatus('error');
        setMessage('Нет соединения. Изменения остаются в этой вкладке. Повторите сохранение.');
        return null;
      } finally {
        saving.current = null;
      }
    })();
    saving.current = operation;
    return operation;
  }, []);
  useEffect(() => {
    if (!dirty.current || conflict.current) return;
    const timer = setTimeout(() => {
      void persist();
    }, 1400);
    return () => clearTimeout(timer);
  }, [doc, persist]);
  useEffect(() => {
    editorHistory.current = { url: location.href, state: window.history.state };
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty.current) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    const traverse = (event: PopStateEvent) => {
      if (!dirty.current) return;
      if (window.confirm('Есть несохранённые изменения. Уйти без сохранения?')) {
        dirty.current = false;
        return;
      }
      event.stopImmediatePropagation();
      window.history.pushState(editorHistory.current.state, '', editorHistory.current.url);
    };
    const navigate = (event: MouseEvent) => {
      if (
        !dirty.current ||
        event.defaultPrevented ||
        event.button !== 0 ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey
      )
        return;
      const anchor = (event.target as HTMLElement)?.closest('a');
      if (
        !anchor ||
        anchor.target === '_blank' ||
        anchor.hasAttribute('download') ||
        anchor.href === window.location.href
      )
        return;
      const url = new URL(anchor.href);
      if (url.origin === location.origin) {
        event.preventDefault();
        event.stopPropagation();
        setLeave(url.pathname + url.search);
      }
    };
    window.addEventListener('beforeunload', warn);
    window.addEventListener('popstate', traverse, true);
    document.addEventListener('click', navigate, true);
    const broadcast = new BroadcastChannel(`academy-course-${initial.id}`);
    channel.current = broadcast;
    broadcast.onmessage = (event) => {
      if (Number(event.data?.version) > latest.current.version) setRemote(true);
    };
    return () => {
      window.removeEventListener('beforeunload', warn);
      window.removeEventListener('popstate', traverse, true);
      document.removeEventListener('click', navigate, true);
      broadcast.close();
    };
  }, [initial.id]);
  const flush = async () => {
    let version: number | null;
    do {
      version = await persist();
    } while (version !== null && dirty.current);
    return version;
  };
  const selectedModule = doc.modules.find((m) => m.lessons.some((l) => l.id === selected)),
    lesson = selectedModule?.lessons.find((l) => l.id === selected);
  const updateLesson = (change: (lesson: Lesson) => Lesson) =>
    update((c) => ({
      ...c,
      modules: c.modules.map((m) => ({
        ...m,
        lessons: m.lessons.map((l) => (l.id === selected ? change(l) : l)),
      })),
    }));
  function addModule() {
    const id = crypto.randomUUID();
    update((c) => ({
      ...c,
      modules: [...c.modules, { id, title: `Модуль ${c.modules.length + 1}`, lessons: [] }],
    }));
    setTab('modules');
  }
  function addLesson(moduleId: string) {
    const id = crypto.randomUUID();
    update((c) => ({
      ...c,
      modules: c.modules.map((m) =>
        m.id === moduleId
          ? {
              ...m,
              lessons: [
                ...m.lessons,
                {
                  id,
                  title: 'Новый урок',
                  slug: `novyi-urok-${id.slice(0, 8)}`,
                  duration: 10,
                  published: true,
                  blocks: [newBlock('rich_text')],
                },
              ],
            }
          : m,
      ),
    }));
    setSelected(id);
    setTab('lessons');
  }
  function cloneLesson(l: Lesson): Lesson {
    const id = crypto.randomUUID();
    return {
      ...structuredClone(l),
      id,
      title: `${l.title.slice(0, 168)} — копия`,
      slug: `${l.slug.slice(0, 80)}-${id.slice(0, 8)}`,
      blocks: l.blocks.map((b) => ({ ...structuredClone(b), id: crypto.randomUUID() })),
    };
  }
  function changeBlock(block: LessonBlock) {
    updateLesson((l) => ({ ...l, blocks: l.blocks.map((b) => (b.id === block.id ? block : b)) }));
  }
  const saveLabel = {
    saved: doc.version === 0 ? 'Новый черновик' : 'Все изменения сохранены',
    dirty: 'Есть несохранённые изменения',
    saving: 'Сохраняем…',
    error: 'Не удалось сохранить',
    conflict: 'Конфликт версий',
  }[status];
  return (
    <div className="course-editor">
      <div className="editor-heading">
        <div>
          <Link href="/admin/courses" className="editor-back">
            <ArrowLeft size={14} />
            Все курсы
          </Link>
          <h1>{doc.title || 'Новая программа'}</h1>
          <div className={`save-status status-${status}`} role="status">
            {status === 'saving' ? (
              <LoaderCircle size={13} className="spin" />
            ) : status === 'saved' ? (
              <Check size={13} />
            ) : (
              <span className="status-dot" />
            )}
            {saveLabel}
          </div>
        </div>
        <div className="editor-heading-actions">
          <Button
            aria-label="Сохранить"
            variant="secondary"
            busy={status === 'saving'}
            onClick={() => void persist()}
          >
            <Save size={16} />
            <span>Сохранить</span>
          </Button>
          <Button
            aria-label="Предпросмотр"
            variant="secondary"
            disabled={status === 'saving'}
            onClick={() =>
              start(async () => {
                const version = await flush();
                if (version !== null) {
                  dirty.current = false;
                  router.push(
                    `/admin/courses/${doc.id}/preview${selected ? `?lesson=${selected}` : ''}`,
                  );
                }
              })
            }
          >
            <Eye size={16} />
            <span>Предпросмотр</span>
          </Button>
          {role === 'admin' && (
            <ConfirmDialog
              title="Опубликовать изменения?"
              description="Новая редакция станет доступна ученикам. Их прогресс сохранится. Незавершённые черновые уроки можно исключить из публикации."
              confirmLabel="Опубликовать"
              trigger={
                <Button
                  aria-label="Опубликовать"
                  disabled={pending || status === 'saving' || status === 'conflict'}
                >
                  <Send size={16} />
                  <span>Опубликовать</span>
                </Button>
              }
              onConfirm={async () => {
                const version = await flush();
                if (version === null) return false;
                const r = await publishCourse(doc.id, version);
                if (!r.ok) {
                  setMessage(r.error);
                  toast.error(r.error);
                  return false;
                }
                toast.success('Курс опубликован');
                return true;
              }}
            />
          )}
        </div>
      </div>
      {(message || remote) && (
        <div
          className={
            status === 'conflict' || status === 'error'
              ? 'form-error editor-notice'
              : 'notice editor-notice'
          }
          role="alert"
        >
          <span>
            {message ||
              'В другой вкладке сохранена новая версия курса. Обновите страницу перед редактированием.'}
          </span>
          <div>
            {status === 'error' && (
              <Button variant="secondary" onClick={() => void persist()}>
                Повторить
              </Button>
            )}
            {(status === 'conflict' || remote) && (
              <ConfirmDialog
                title="Загрузить актуальную версию?"
                description="Несохранённые изменения этой вкладки будут отброшены."
                confirmLabel="Загрузить"
                trigger={<Button variant="secondary">Загрузить актуальную</Button>}
                onConfirm={async () => {
                  dirty.current = false;
                  window.location.reload();
                }}
              />
            )}
          </div>
        </div>
      )}
      <div className="editor-tabs" role="tablist" aria-label="Разделы редактора">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={tab === t.id ? 'active' : ''}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {t.id === 'modules' && <span aria-hidden="true">{doc.modules.length}</span>}
          </button>
        ))}
      </div>
      {tab === 'general' && (
        <div className="editor-general">
          <section className="panel form-stack">
            <div className="panel-header">
              <div>
                <h2>О программе</h2>
                <p>Помогите ученику понять, чему он научится.</p>
              </div>
              <Badge>Черновик · v{doc.version}</Badge>
            </div>
            <Field label="Название курса">
              <Input
                value={doc.title}
                maxLength={180}
                onChange={(e) => update((c) => ({ ...c, title: e.target.value }))}
              />
            </Field>
            <Field label="Короткое описание" hint="До 400 символов. Используется в каталоге.">
              <textarea
                className="input"
                value={doc.summary}
                maxLength={400}
                onChange={(e) => update((c) => ({ ...c, summary: e.target.value }))}
              />
            </Field>
            <Field label="Полное описание">
              <textarea
                className="input tall-input"
                value={doc.description}
                maxLength={12000}
                onChange={(e) => update((c) => ({ ...c, description: e.target.value }))}
              />
            </Field>
            <div className="form-row">
              <Field label="Автор">
                <Input
                  value={doc.author}
                  maxLength={180}
                  onChange={(e) => update((c) => ({ ...c, author: e.target.value }))}
                />
              </Field>
              <Field label="Категория">
                <select
                  className="input"
                  value={doc.categoryId ?? ''}
                  onChange={(e) => update((c) => ({ ...c, categoryId: e.target.value || null }))}
                >
                  <option value="">Без категории</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Теги" hint="Через запятую, не больше 12 тегов.">
              <Input
                defaultValue={doc.tags.join(', ')}
                onBlur={(e) =>
                  update((c) => ({
                    ...c,
                    tags: e.target.value
                      .split(',')
                      .map((t) => t.trim())
                      .filter(Boolean)
                      .slice(0, 12),
                  }))
                }
              />
            </Field>
          </section>
          <aside className="form-stack">
            <section className="panel form-stack">
              <h2>Обложка</h2>
              <Uploader
                imagesOnly
                value={doc.coverId}
                onChange={(coverId) => update((c) => ({ ...c, coverId }))}
              />
              <Field label="Или выберите из медиатеки">
                <select
                  className="input"
                  value={doc.coverId ?? ''}
                  onChange={(e) => update((c) => ({ ...c, coverId: e.target.value || null }))}
                >
                  <option value="">Без обложки</option>
                  {media
                    .filter((m) => m.mime_type.startsWith('image/'))
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.filename}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="Цвет программы">
                <select
                  className="input"
                  value={doc.accent}
                  onChange={(e) =>
                    update((c) => ({ ...c, accent: e.target.value as CourseDraft['accent'] }))
                  }
                >
                  <option value="blue">Синий</option>
                  <option value="lime">Лайм</option>
                  <option value="lilac">Лиловый</option>
                  <option value="peach">Персиковый</option>
                </select>
              </Field>
            </section>
            <div className="editor-tip">
              <Layers size={20} />
              <h3>Сначала — структура</h3>
              <p>
                Разделите программу на модули. Затем наполните уроки текстом, видео и материалами.
              </p>
              <Button variant="secondary" onClick={() => setTab('modules')}>
                Перейти к модулям <ChevronRight size={16} />
              </Button>
            </div>
          </aside>
        </div>
      )}
      {tab === 'modules' && (
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Структура программы</h2>
              <p>Перетаскивайте модули и уроки. С клавиатуры: пробел, стрелки, пробел.</p>
            </div>
            <Button variant="secondary" onClick={addModule}>
              <FolderPlus size={17} />
              Добавить модуль
            </Button>
          </div>
          {doc.modules.length ? (
            <SortableList
              items={doc.modules}
              label={(m) => m.title}
              onReorder={(modules) => update((c) => ({ ...c, modules }))}
              render={(m) => (
                <div className="module-editor">
                  <div className="module-editor-heading">
                    <Input
                      aria-label="Название модуля"
                      value={m.title}
                      maxLength={180}
                      onChange={(e) =>
                        update((c) => ({
                          ...c,
                          modules: c.modules.map((x) =>
                            x.id === m.id ? { ...x, title: e.target.value } : x,
                          ),
                        }))
                      }
                    />
                    <button
                      className="icon-button"
                      aria-label={`Дублировать модуль ${m.title}`}
                      onClick={() =>
                        update((c) => ({
                          ...c,
                          modules: [
                            ...c.modules,
                            {
                              ...m,
                              id: crypto.randomUUID(),
                              title: `${m.title.slice(0, 170)} — копия`,
                              lessons: m.lessons.map(cloneLesson),
                            },
                          ],
                        }))
                      }
                    >
                      <Copy size={16} />
                    </button>
                    <ConfirmDialog
                      title="Удалить модуль из черновика?"
                      description="Все уроки этого модуля будут исключены из новой редакции. Опубликованная программа изменится только после публикации Admin."
                      confirmLabel="Удалить модуль"
                      danger
                      trigger={
                        <button className="icon-button" aria-label={`Удалить модуль ${m.title}`}>
                          <Trash2 size={16} />
                        </button>
                      }
                      onConfirm={async () =>
                        update((c) => ({ ...c, modules: c.modules.filter((x) => x.id !== m.id) }))
                      }
                    />
                  </div>
                  <SortableList
                    items={m.lessons}
                    label={(l) => l.title}
                    onReorder={(lessons) =>
                      update((c) => ({
                        ...c,
                        modules: c.modules.map((x) => (x.id === m.id ? { ...x, lessons } : x)),
                      }))
                    }
                    render={(l) => (
                      <div className="module-editor-lesson">
                        <button
                          onClick={() => {
                            setSelected(l.id);
                            setTab('lessons');
                          }}
                        >
                          <FileText size={16} />
                          <span>{l.title}</span>
                          {!l.published && <Badge>Черновик</Badge>}
                          <ChevronRight size={15} />
                        </button>
                        <button
                          className="icon-button"
                          aria-label={`Дублировать урок ${l.title}`}
                          onClick={() =>
                            update((c) => ({
                              ...c,
                              modules: c.modules.map((x) =>
                                x.id === m.id
                                  ? { ...x, lessons: [...x.lessons, cloneLesson(l)] }
                                  : x,
                              ),
                            }))
                          }
                        >
                          <Copy size={15} />
                        </button>
                      </div>
                    )}
                  />
                  <Button variant="ghost" onClick={() => addLesson(m.id)}>
                    <Plus size={15} />
                    Добавить урок
                  </Button>
                </div>
              )}
            />
          ) : (
            <EmptyState
              title="Соберите каркас программы"
              description="Создайте первый модуль, а затем добавьте в него уроки."
              action={
                <Button onClick={addModule}>
                  <Plus size={16} />
                  Первый модуль
                </Button>
              }
            />
          )}
        </section>
      )}
      {tab === 'lessons' && (
        <div className="editor-lesson-layout">
          <aside className="editor-lesson-nav">
            <div className="panel-header">
              <h2>Программа</h2>
              <button className="icon-button" aria-label="Добавить модуль" onClick={addModule}>
                <Plus size={17} />
              </button>
            </div>
            {doc.modules.map((m) => (
              <div key={m.id} className="editor-nav-module">
                <strong>{m.title}</strong>
                {m.lessons.map((l) => (
                  <button
                    key={l.id}
                    className={selected === l.id ? 'active' : ''}
                    onClick={() => setSelected(l.id)}
                  >
                    <FileText size={14} />
                    <span>{l.title}</span>
                  </button>
                ))}
                <button className="add-lesson-inline" onClick={() => addLesson(m.id)}>
                  <Plus size={14} />
                  Новый урок
                </button>
              </div>
            ))}
          </aside>
          <section className="lesson-editor-body">
            {lesson ? (
              <>
                <div className="panel form-stack">
                  <div className="panel-header">
                    <div>
                      <div className="eyebrow">{selectedModule?.title}</div>
                      <h2>Содержание урока</h2>
                    </div>
                    <ConfirmDialog
                      title="Удалить урок из черновика?"
                      description="Опубликованная версия останется доступной до следующей публикации. Прогресс сохранится в истории."
                      confirmLabel="Удалить урок"
                      danger
                      trigger={
                        <button className="icon-button" aria-label="Удалить выбранный урок">
                          <Trash2 size={17} />
                        </button>
                      }
                      onConfirm={async () => {
                        update((c) => ({
                          ...c,
                          modules: c.modules.map((m) => ({
                            ...m,
                            lessons: m.lessons.filter((l) => l.id !== selected),
                          })),
                        }));
                        setSelected(undefined);
                      }}
                    />
                  </div>
                  <Field label="Название урока">
                    <Input
                      value={lesson.title}
                      maxLength={180}
                      onChange={(e) => updateLesson((l) => ({ ...l, title: e.target.value }))}
                    />
                  </Field>
                  <div className="form-row">
                    <Field label="Длительность, минут">
                      <Input
                        type="number"
                        min={0}
                        max={1440}
                        value={lesson.duration}
                        onChange={(e) =>
                          updateLesson((l) => ({ ...l, duration: Number(e.target.value) }))
                        }
                      />
                    </Field>
                    <Field label="Модуль">
                      <select
                        className="input"
                        value={selectedModule?.id}
                        onChange={(e) => {
                          const target = e.target.value;
                          update((c) => ({
                            ...c,
                            modules: c.modules.map((m) => ({
                              ...m,
                              lessons:
                                m.id === target
                                  ? [...m.lessons, lesson]
                                  : m.lessons.filter((l) => l.id !== lesson.id),
                            })),
                          }));
                        }}
                      >
                        {doc.modules.map((m) => (
                          <option value={m.id} key={m.id}>
                            {m.title}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>
                  <Field
                    label="Адрес урока"
                    hint="Переименование заголовка не меняет адрес. Старый адрес сохранится после публикации."
                  >
                    <Input
                      value={lesson.slug}
                      onChange={(e) => updateLesson((l) => ({ ...l, slug: e.target.value }))}
                    />
                  </Field>
                  <label className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={lesson.published}
                      onChange={(e) => updateLesson((l) => ({ ...l, published: e.target.checked }))}
                    />
                    <span>Включить урок в следующую публикацию</span>
                  </label>
                </div>
                <div className="block-list">
                  <SortableList
                    items={lesson.blocks}
                    label={(b) => blockLabels[b.type]}
                    onReorder={(blocks) => updateLesson((l) => ({ ...l, blocks }))}
                    render={(b, index) => (
                      <section className="block-panel">
                        <div className="block-panel-header">
                          <span>
                            {String(index + 1).padStart(2, '0')} / {blockLabels[b.type]}
                          </span>
                          <div>
                            <button
                              className="icon-button"
                              aria-label={`Дублировать блок ${blockLabels[b.type]}`}
                              onClick={() =>
                                updateLesson((l) => ({
                                  ...l,
                                  blocks: l.blocks.flatMap((x) =>
                                    x.id === b.id
                                      ? [x, { ...structuredClone(x), id: crypto.randomUUID() }]
                                      : [x],
                                  ),
                                }))
                              }
                            >
                              <Copy size={15} />
                            </button>
                            <ConfirmDialog
                              title="Удалить блок?"
                              description="Блок будет удалён из рабочего черновика урока."
                              confirmLabel="Удалить"
                              danger
                              trigger={
                                <button
                                  className="icon-button"
                                  aria-label={`Удалить блок ${blockLabels[b.type]}`}
                                >
                                  <Trash2 size={15} />
                                </button>
                              }
                              onConfirm={async () =>
                                updateLesson((l) => ({
                                  ...l,
                                  blocks: l.blocks.filter((x) => x.id !== b.id),
                                }))
                              }
                            />
                          </div>
                        </div>
                        <BlockEditor
                          block={b}
                          onChange={changeBlock}
                          media={media}
                          protectedProviders={protectedProviders}
                        />
                      </section>
                    )}
                  />
                </div>
                <div className="block-palette">
                  <div className="eyebrow">ДОБАВИТЬ В УРОК</div>
                  <div>
                    {(Object.keys(blockLabels) as LessonBlock['type'][]).map((type) => (
                      <button
                        key={type}
                        onClick={() =>
                          updateLesson((l) => ({ ...l, blocks: [...l.blocks, newBlock(type)] }))
                        }
                      >
                        <Plus size={14} />
                        {blockLabels[type]}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <EmptyState
                title="Выберите урок"
                description="Откройте урок слева или добавьте новый в структуру программы."
                action={<Button onClick={() => setTab('modules')}>К модулям</Button>}
              />
            )}
          </section>
        </div>
      )}
      {tab === 'access' && (
        <section className="panel form-stack narrow-panel">
          <div className="panel-header">
            <div>
              <h2>Доступ к обучению</h2>
              <p>Настройки применяются при публикации курса.</p>
            </div>
            <ShieldCheck size={22} />
          </div>
          <Field label="Кто может учиться">
            <select
              className="input"
              value={doc.accessMode}
              disabled={role !== 'admin'}
              onChange={(e) =>
                update((c) => ({ ...c, accessMode: e.target.value as CourseDraft['accessMode'] }))
              }
            >
              <option value="restricted">Только назначенные пользователи</option>
              <option value="registered">Все зарегистрированные пользователи</option>
            </select>
          </Field>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={doc.sequential}
              disabled={role !== 'admin'}
              onChange={(e) => update((c) => ({ ...c, sequential: e.target.checked }))}
            />
            <span>
              Последовательное прохождение
              <small>Следующий урок доступен после завершения предыдущих.</small>
            </span>
          </label>
          {role === 'admin' ? (
            <Link
              className="button button-secondary align-start"
              href={`/admin/users?course=${doc.id}`}
            >
              Управлять назначениями <ChevronRight size={16} />
            </Link>
          ) : (
            <div className="notice">Права доступа и публикацию настраивает администратор.</div>
          )}
        </section>
      )}
      {tab === 'settings' && (
        <section className="panel form-stack narrow-panel">
          <h2>Настройки программы</h2>
          <Field
            label="Адрес курса"
            hint="Латиница, цифры и дефисы. Старый адрес станет перенаправлением после публикации."
          >
            <Input
              value={doc.slug}
              onChange={(e) => update((c) => ({ ...c, slug: e.target.value }))}
            />
          </Field>
          <Button
            variant="secondary"
            className="align-start"
            onClick={() => update((c) => ({ ...c, slug: slugify(c.title) }))}
          >
            Сформировать из названия
          </Button>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={doc.featured}
              onChange={(e) => update((c) => ({ ...c, featured: e.target.checked }))}
            />
            <span>Выделить программу в каталоге</span>
          </label>
          <div className="notice">
            Редактор работает с черновиком. Ученики увидят изменения только после публикации
            администратором.
          </div>
        </section>
      )}
      <Dialog.Root
        open={!!leave}
        onOpenChange={(open) => {
          if (!open) setLeave(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog-content">
            <Dialog.Title className="dialog-title">Сохранить перед уходом?</Dialog.Title>
            <Dialog.Description className="dialog-description">
              В этой вкладке есть несохранённые изменения.
            </Dialog.Description>
            <div className="dialog-actions">
              <Button
                variant="ghost"
                onClick={() => {
                  dirty.current = false;
                  router.push(leave!);
                }}
              >
                Уйти без сохранения
              </Button>
              <Button
                busy={status === 'saving'}
                onClick={async () => {
                  const v = await flush();
                  if (v !== null) {
                    dirty.current = false;
                    router.push(leave!);
                  }
                }}
              >
                Сохранить и уйти
              </Button>
            </div>
            <Dialog.Close className="icon-button dialog-close" aria-label="Остаться в редакторе">
              <X size={18} />
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
