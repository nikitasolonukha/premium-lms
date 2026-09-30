'use client';
import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { Expand, LoaderCircle, Play, RefreshCw, ShieldCheck } from 'lucide-react';
import type { PlaybackGrant } from '@/lib/video';
import { Button } from './ui';
import { toast } from 'sonner';
import { playbackRenewalDelay } from '@/lib/player-bridge';
import type { PlaybackPosition } from './protected-video-embed';
const ProtectedVideoEmbed = dynamic(() => import('./protected-video-embed'), {
  ssr: false,
  loading: () => (
    <div className="video-placeholder" role="status">
      Подключаем защищённый плеер…
    </div>
  ),
});
export type WatermarkOptions = { intervalSeconds?: number; opacity?: number };
export function Watermark({
  viewer,
  enabled,
  intervalSeconds = 18,
  opacity = 0.28,
}: { viewer: string; enabled: boolean } & WatermarkOptions) {
  const [position, setPosition] = useState(0);
  useEffect(() => {
    if (!enabled || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = setInterval(() => setPosition((p) => (p + 1) % 4), intervalSeconds * 1000);
    return () => clearInterval(timer);
  }, [enabled, intervalSeconds]);
  return enabled ? (
    <span className={`watermark watermark-${position}`} style={{ opacity }} aria-hidden="true">
      {viewer}
    </span>
  ) : null;
}
export function ProtectedImage({
  id,
  alt,
  caption,
  viewer,
  watermark,
  watermarkOptions,
}: {
  id: string;
  alt: string;
  caption?: string;
  viewer: string;
  watermark: boolean;
  watermarkOptions?: WatermarkOptions;
}) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <figure className="lesson-figure">
      <div ref={ref} className="image-stage">
        <img src={`/api/media/${id}`} alt={alt} loading="lazy" />
        <Watermark viewer={viewer} enabled={watermark} {...watermarkOptions} />
        <button
          className="media-expand icon-button"
          aria-label="Развернуть изображение"
          onClick={() =>
            ref.current
              ?.requestFullscreen()
              .catch(() => toast.error('Полноэкранный режим недоступен'))
          }
        >
          <Expand size={17} />
        </button>
      </div>
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}
export function VideoPlayer({
  lessonId,
  blockId,
  title,
  viewer,
  watermark,
  watermarkOptions,
  previewGrant,
  preview = false,
}: {
  lessonId: string;
  blockId: string;
  title: string;
  viewer: string;
  watermark: boolean;
  watermarkOptions?: WatermarkOptions;
  previewGrant?: PlaybackGrant;
  preview?: boolean;
}) {
  const [grant, setGrant] = useState<PlaybackGrant | null>(previewGrant ?? null),
    [error, setError] = useState(''),
    [attempt, setAttempt] = useState(0),
    [started, setStarted] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const remember = useRef<PlaybackPosition>({ seconds: 0, playing: true });
  useEffect(() => {
    if (previewGrant) return;
    let cancelled = false;
    const controller = new AbortController();
    fetch(`/api/playback/${lessonId}/${blockId}${preview ? '?preview=1' : ''}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (r) => {
        if (!r.ok)
          throw new Error(
            r.status === 429
              ? 'Слишком много запросов. Повторите через минуту.'
              : 'Видео недоступно. Проверьте соединение.',
          );
        return r.json();
      })
      .then((data) => {
        if (!cancelled) {
          setGrant(data);
          setError('');
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [lessonId, blockId, attempt, previewGrant, preview]);
  useEffect(() => {
    if (!started || !grant?.protected || !grant.expiresAt || error) return;
    const delay = playbackRenewalDelay(grant.expiresAt);
    const timer = setTimeout(() => setAttempt((a) => a + 1), delay);
    const onVisible = () => {
      if (document.visibilityState === 'visible' && playbackRenewalDelay(grant.expiresAt!) === 0) {
        clearTimeout(timer);
        setAttempt((a) => a + 1);
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [started, grant, error]);
  return (
    <div className="video-block">
      <div className="video-frame" ref={ref}>
        {error ? (
          <div className="video-placeholder">
            <p role="alert">{error}</p>
            <Button
              variant="secondary"
              onClick={() => {
                setError('');
                setGrant(null);
                setAttempt((a) => a + 1);
              }}
            >
              <RefreshCw size={17} />
              Повторить
            </Button>
          </div>
        ) : !grant ? (
          <div className="video-placeholder" role="status">
            <LoaderCircle size={28} className="spin" />
            <span>Подготавливаем видео…</span>
          </div>
        ) : !started ? (
          <button
            className="video-start"
            onClick={() => {
              if (
                grant.protected &&
                grant.expiresAt &&
                playbackRenewalDelay(grant.expiresAt) === 0
              ) {
                setGrant(null);
                setAttempt((a) => a + 1);
              }
              setStarted(true);
            }}
            aria-label={`Смотреть: ${title}`}
          >
            <span className="video-play">
              <Play size={26} fill="currentColor" />
            </span>
            <span>{title}</span>
            <small>{grant.provider.toUpperCase()} · НАЖМИТЕ ДЛЯ ПРОСМОТРА</small>
          </button>
        ) : grant.protected ? (
          <ProtectedVideoEmbed
            key={grant.url}
            grant={grant}
            title={title}
            remember={remember}
            onError={setError}
          />
        ) : grant.kind === 'video' ? (
          <video
            src={grant.url}
            controls
            playsInline
            preload="metadata"
            controlsList="nodownload"
            onError={() => setError('Источник видео временно недоступен.')}
          />
        ) : (
          <iframe
            src={grant.url}
            title={title}
            allow="autoplay; encrypted-media; picture-in-picture"
            sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
            referrerPolicy="strict-origin-when-cross-origin"
          />
        )}
        <Watermark viewer={viewer} enabled={watermark} {...watermarkOptions} />
        {started && (
          <button
            className="media-expand icon-button"
            aria-label="Развернуть плеер с водяным знаком"
            onClick={() =>
              ref.current
                ?.requestFullscreen()
                .catch(() => toast.error('Полноэкранный режим недоступен'))
            }
          >
            <Expand size={17} />
          </button>
        )}
      </div>
      <div className="video-caption">
        <span>{title}</span>
        {watermark && (
          <span>
            <ShieldCheck size={12} />
            Персональный просмотр
          </span>
        )}
      </div>
    </div>
  );
}
