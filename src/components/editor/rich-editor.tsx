'use client';
import { useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import {
  Bold,
  Italic,
  List,
  ListOrdered,
  Quote,
  Code,
  Link as LinkIcon,
  Undo2,
  Redo2,
} from 'lucide-react';
import type { RichNode } from '@/lib/schemas';
import { safeWebUrl } from '@/lib/video';
import { Button, Input } from '../ui';
export default function RichEditor({
  value,
  onChange,
}: {
  value: RichNode;
  onChange: (value: RichNode) => void;
}) {
  const [link, setLink] = useState<string | null>(null);
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        link: {
          openOnClick: false,
          protocols: ['https'],
          HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer' },
        },
      }),
      Placeholder.configure({ placeholder: 'Добавьте объяснение, примеры и важные мысли…' }),
    ],
    content: value,
    immediatelyRender: false,
    onUpdate: ({ editor }) => onChange(editor.getJSON() as RichNode),
    editorProps: {
      attributes: { 'aria-label': 'Текст урока', role: 'textbox', 'aria-multiline': 'true' },
    },
  });
  if (!editor) return <div className="skeleton rich-skeleton" />;
  const commands = [
    {
      icon: Bold,
      label: 'Жирный',
      action: () => editor.chain().focus().toggleBold().run(),
      active: editor.isActive('bold'),
    },
    {
      icon: Italic,
      label: 'Курсив',
      action: () => editor.chain().focus().toggleItalic().run(),
      active: editor.isActive('italic'),
    },
    {
      icon: List,
      label: 'Маркированный список',
      action: () => editor.chain().focus().toggleBulletList().run(),
      active: editor.isActive('bulletList'),
    },
    {
      icon: ListOrdered,
      label: 'Нумерованный список',
      action: () => editor.chain().focus().toggleOrderedList().run(),
      active: editor.isActive('orderedList'),
    },
    {
      icon: Quote,
      label: 'Цитата',
      action: () => editor.chain().focus().toggleBlockquote().run(),
      active: editor.isActive('blockquote'),
    },
    {
      icon: Code,
      label: 'Код',
      action: () => editor.chain().focus().toggleCodeBlock().run(),
      active: editor.isActive('codeBlock'),
    },
    { icon: LinkIcon, label: 'Ссылка', action: () => setLink(''), active: editor.isActive('link') },
    {
      icon: Undo2,
      label: 'Отменить',
      action: () => editor.chain().focus().undo().run(),
      active: false,
    },
    {
      icon: Redo2,
      label: 'Повторить',
      action: () => editor.chain().focus().redo().run(),
      active: false,
    },
  ];
  return (
    <div className="rich-editor">
      <div className="rich-toolbar" role="toolbar" aria-label="Форматирование текста">
        {commands.map((c) => (
          <button
            type="button"
            className={`icon-button ${c.active ? 'active' : ''}`}
            key={c.label}
            aria-label={c.label}
            aria-pressed={c.active}
            onClick={c.action}
          >
            <c.icon size={16} />
          </button>
        ))}
      </div>
      {link !== null && (
        <div className="rich-link-input">
          <Input
            aria-label="HTTPS-адрес ссылки"
            placeholder="https://example.com"
            value={link}
            onChange={(e) => setLink(e.target.value)}
          />
          <Button
            type="button"
            variant="secondary"
            disabled={!safeWebUrl(link)}
            onClick={() => {
              editor.chain().focus().extendMarkRange('link').setLink({ href: link }).run();
              setLink(null);
            }}
          >
            Добавить
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              editor.chain().focus().unsetLink().run();
              setLink(null);
            }}
          >
            Убрать
          </Button>
        </div>
      )}
      <EditorContent editor={editor} />
    </div>
  );
}
