import { Fragment, type ReactNode } from 'react';
import { ArrowUpRight, Download, FileText, Info, Quote } from 'lucide-react';
import type { LessonBlock, RichNode } from '@/lib/schemas';
import { safeWebUrl } from '@/lib/video';
import { ProtectedImage, VideoPlayer, type WatermarkOptions } from './protected-media';
function RichContent({ node }: { node: RichNode }): ReactNode {
  let children: ReactNode = node.content?.map((child, i) => <RichContent node={child} key={i} />);
  if (node.type === 'text') {
    children = node.text ?? '';
    for (const mark of node.marks ?? []) {
      if (mark.type === 'bold') children = <strong>{children}</strong>;
      else if (mark.type === 'italic') children = <em>{children}</em>;
      else if (mark.type === 'strike') children = <s>{children}</s>;
      else if (mark.type === 'underline') children = <u>{children}</u>;
      else if (mark.type === 'code') children = <code>{children}</code>;
      else if (
        mark.type === 'link' &&
        typeof mark.attrs?.href === 'string' &&
        safeWebUrl(mark.attrs.href)
      )
        children = (
          <a href={mark.attrs.href} target="_blank" rel="noopener noreferrer">
            {children}
          </a>
        );
    }
    return children;
  }
  switch (node.type) {
    case 'doc':
      return <>{children}</>;
    case 'paragraph':
      return <p>{children || <br />}</p>;
    case 'heading':
      return node.attrs?.level === 3 ? <h3>{children}</h3> : <h2>{children}</h2>;
    case 'bulletList':
      return <ul>{children}</ul>;
    case 'orderedList':
      return (
        <ol start={typeof node.attrs?.start === 'number' ? node.attrs.start : 1}>{children}</ol>
      );
    case 'listItem':
      return <li>{children}</li>;
    case 'blockquote':
      return <blockquote>{children}</blockquote>;
    case 'codeBlock':
      return (
        <pre>
          <code>{children}</code>
        </pre>
      );
    case 'hardBreak':
      return <br />;
    case 'horizontalRule':
      return <hr />;
    default:
      return null;
  }
}
export function BlockRenderer({
  blocks,
  lessonId,
  viewer,
  watermark = false,
  watermarkOptions,
  preview = false,
}: {
  blocks: LessonBlock[];
  lessonId: string;
  viewer: string;
  watermark?: boolean;
  watermarkOptions?: WatermarkOptions;
  preview?: boolean;
}) {
  return (
    <div className="lesson-content">
      {blocks.map((block) => {
        let content: ReactNode = null;
        switch (block.type) {
          case 'heading':
            content =
              block.data.level === 3 ? <h3>{block.data.text}</h3> : <h2>{block.data.text}</h2>;
            break;
          case 'rich_text':
            content = (
              <div className="rich-content">
                <RichContent node={block.data.document} />
              </div>
            );
            break;
          case 'image':
            content = (
              <ProtectedImage
                id={block.data.assetId}
                alt={block.data.alt}
                caption={block.data.caption}
                viewer={viewer}
                watermark={watermark}
                watermarkOptions={watermarkOptions}
              />
            );
            break;
          case 'video': {
            content = (
              <VideoPlayer
                lessonId={lessonId}
                blockId={block.id}
                title={block.data.title}
                viewer={viewer}
                watermark={watermark}
                watermarkOptions={watermarkOptions}
                preview={preview}
              />
            );
            break;
          }
          case 'file':
            content = (
              <a href={`/api/media/${block.data.assetId}?download=1`} className="lesson-file">
                <span className="file-icon">
                  <FileText size={22} />
                </span>
                <span>
                  <strong>{block.data.label}</strong>
                  <small>Материал к уроку · скачать файл</small>
                </span>
                <Download size={19} />
              </a>
            );
            break;
          case 'link':
            content = safeWebUrl(block.data.url) ? (
              <a
                className="lesson-link"
                href={block.data.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                <span>
                  {block.data.label}
                  <small>{new URL(block.data.url).hostname}</small>
                </span>
                <ArrowUpRight size={21} />
              </a>
            ) : null;
            break;
          case 'quote':
            content = (
              <blockquote className="lesson-quote">
                <Quote size={25} />
                <p>{block.data.text}</p>
                <cite>{block.data.author}</cite>
              </blockquote>
            );
            break;
          case 'callout':
            content = (
              <aside className={`lesson-callout callout-${block.data.tone}`}>
                <Info size={20} />
                <p>{block.data.text}</p>
              </aside>
            );
            break;
          case 'divider':
            content = <hr />;
            break;
          case 'code':
            content = (
              <div className="code-block">
                <span>{block.data.language || 'Код'}</span>
                <pre>
                  <code>{block.data.code}</code>
                </pre>
              </div>
            );
            break;
          case 'gallery':
            content = (
              <div className="lesson-gallery">
                {block.data.items.map((item, i) => (
                  <ProtectedImage
                    key={`${item.assetId}-${i}`}
                    id={item.assetId}
                    alt={item.alt}
                    viewer={viewer}
                    watermark={watermark}
                    watermarkOptions={watermarkOptions}
                  />
                ))}
              </div>
            );
            break;
        }
        return <Fragment key={block.id}>{content}</Fragment>;
      })}
    </div>
  );
}
