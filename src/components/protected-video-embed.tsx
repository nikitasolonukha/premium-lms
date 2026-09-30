'use client';
import { useEffect, useRef } from 'react';
import type { PlaybackGrant } from '@/lib/video';
import { readPlayerMessage } from '@/lib/player-bridge';

export type PlaybackPosition = { seconds: number; playing: boolean };
type StreamApi = {
  currentTime: number;
  duration: number;
  paused: boolean;
  play(): Promise<void>;
  pause(): void;
  addEventListener(event: string, callback: () => void): void;
  removeEventListener(event: string, callback: () => void): void;
};
type StreamFactory = (frame: HTMLIFrameElement) => StreamApi;
let streamSdk: Promise<StreamFactory> | undefined;
function loadStreamSdk() {
  if (streamSdk) return streamSdk;
  streamSdk = new Promise<StreamFactory>((resolve, reject) => {
    const script = document.createElement('script');
    const fail = () => {
      clearTimeout(timeout);
      script.remove();
      streamSdk = undefined;
      reject(new Error('PLAYER_SDK_UNAVAILABLE'));
    };
    const timeout = setTimeout(fail, 10000);
    script.src = 'https://embed.cloudflarestream.com/embed/sdk.latest.js';
    script.referrerPolicy = 'no-referrer';
    script.onload = () => {
      const factory = (window as Window & { Stream?: StreamFactory }).Stream;
      if (!factory) return fail();
      clearTimeout(timeout);
      resolve(factory);
    };
    script.onerror = fail;
    document.head.appendChild(script);
  });
  return streamSdk;
}

/** Remounted with each renewed grant. Restores the last observed time/play state. */
export default function ProtectedVideoEmbed({
  grant,
  title,
  remember,
  onError,
}: {
  grant: PlaybackGrant;
  title: string;
  remember: { current: PlaybackPosition };
  onError: (message: string) => void;
}) {
  const ref = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    const frame = ref.current;
    if (!frame) return;
    let disposed = false,
      ready = false,
      cleanup = () => {};
    const fail = () => {
      if (!disposed) onError('Защищённый плеер недоступен. Попробуйте ещё раз.');
    };
    const timeout = setTimeout(fail, 20000);
    const readyOnce = () => {
      ready = true;
      clearTimeout(timeout);
    };
    if (grant.provider === 'cloudflare') {
      loadStreamSdk()
        .then((Stream) => {
          if (disposed) return;
          const api = Stream(frame);
          const restore = () => {
            if (ready) return;
            readyOnce();
            api.currentTime = remember.current.seconds;
            if (remember.current.playing)
              void api.play().catch(() => {
                /* Browser may require another gesture. Controls remain visible. */
              });
          };
          const time = () => {
            if (ready && Number.isFinite(api.currentTime))
              remember.current.seconds = Math.max(0, api.currentTime);
          };
          const play = () => {
            remember.current.playing = true;
          };
          const pause = () => {
            remember.current.playing = false;
          };
          const events: [string, () => void][] = [
            ['loadedmetadata', restore],
            ['canplay', restore],
            ['timeupdate', time],
            ['play', play],
            ['pause', pause],
            ['ended', pause],
            ['error', fail],
          ];
          events.forEach(([event, callback]) => api.addEventListener(event, callback));
          if (api.duration > 0) restore();
          cleanup = () =>
            events.forEach(([event, callback]) => api.removeEventListener(event, callback));
        })
        .catch(fail);
    } else if (grant.provider === 'mux') {
      const origin = new URL(grant.url).origin,
        listener = crypto.randomUUID();
      const send = (method: string, value?: unknown) =>
        frame.contentWindow?.postMessage(
          JSON.stringify({ context: 'player.js', version: '0.0.11', method, value, listener }),
          origin,
        );
      const subscribeReady = () => send('addEventListener', 'ready');
      const receive = (event: MessageEvent) => {
        const data = readPlayerMessage(event, frame.contentWindow, origin);
        if (!data) return;
        if (data.event === 'ready' && !ready) {
          if (
            !data.value ||
            typeof data.value !== 'object' ||
            !('src' in data.value) ||
            data.value.src !== frame.src
          )
            return;
          readyOnce();
          for (const name of ['timeupdate', 'play', 'pause', 'ended', 'error'])
            send('addEventListener', name);
          send('setCurrentTime', remember.current.seconds);
          if (remember.current.playing) send('play');
        } else if (
          ready &&
          data.event === 'timeupdate' &&
          data.value &&
          typeof data.value === 'object' &&
          'seconds' in data.value
        ) {
          const seconds = data.value.seconds;
          if (typeof seconds === 'number' && Number.isFinite(seconds) && seconds >= 0)
            remember.current.seconds = seconds;
        } else if (ready && data.event === 'play') remember.current.playing = true;
        else if (ready && ['pause', 'ended'].includes(data.event)) remember.current.playing = false;
        else if (data.event === 'error') fail();
      };
      window.addEventListener('message', receive);
      frame.addEventListener('load', subscribeReady);
      subscribeReady();
      cleanup = () => {
        for (const name of ['ready', 'timeupdate', 'play', 'pause', 'ended', 'error'])
          send('removeEventListener', name);
        window.removeEventListener('message', receive);
        frame.removeEventListener('load', subscribeReady);
      };
    }
    return () => {
      disposed = true;
      clearTimeout(timeout);
      cleanup();
    };
  }, [grant.provider, grant.url, remember, onError]);
  return (
    <iframe
      ref={ref}
      src={grant.url}
      title={title}
      allow="autoplay; encrypted-media"
      sandbox="allow-scripts allow-same-origin allow-presentation"
      referrerPolicy="strict-origin-when-cross-origin"
    />
  );
}
