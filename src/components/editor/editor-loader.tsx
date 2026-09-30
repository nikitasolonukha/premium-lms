'use client';
import dynamic from 'next/dynamic';
import type { ComponentProps } from 'react';
import type CourseEditor from './course-editor';
const Editor = dynamic(() => import('./course-editor'), {
  ssr: false,
  loading: () => (
    <div className="skeleton skeleton-hero" role="status" aria-label="Загрузка редактора" />
  ),
});
export function EditorLoader(props: ComponentProps<typeof CourseEditor>) {
  return <Editor {...props} />;
}
