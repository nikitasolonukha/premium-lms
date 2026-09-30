import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { mkdtemp, copyFile, writeFile, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import sharp from 'sharp';
const require = createRequire(import.meta.url);
export function binaries(env) {
  let ffmpeg = env.FFMPEG_PATH,
    ffprobe = env.FFPROBE_PATH;
  if (!ffmpeg) {
    try {
      ffmpeg = require('ffmpeg-static');
    } catch {
      ffmpeg = 'ffmpeg';
    }
  }
  if (!ffprobe) {
    try {
      ffprobe = require('ffprobe-static').path;
    } catch {
      ffprobe = 'ffprobe';
    }
  }
  return {
    ffmpeg,
    ffprobe,
    font:
      env.FFMPEG_FONT_PATH ??
      (process.platform === 'win32'
        ? 'C:/Windows/Fonts/arial.ttf'
        : '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'),
  };
}
export function execute(binary, args, { cwd, signal, timeout = 60000, progress } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(binary, args, {
      cwd,
      shell: false,
      windowsHide: true,
      signal,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '',
      stderrBytes = 0;
    const timer = setTimeout(() => p.kill('SIGKILL'), timeout);
    p.stdout.on('data', (b) => {
      output += b.toString();
      if (output.length > 1048576) {
        if (progress) output = output.slice(-8192);
        else {
          output = '';
          p.kill('SIGKILL');
        }
      }
      progress?.(b.toString());
    });
    p.stderr.on('data', (b) => {
      stderrBytes += b.length;
      if (stderrBytes > 8 * 1048576) p.kill('SIGKILL');
    });
    p.on('error', () => {
      clearTimeout(timer);
      reject(new Error('VIDEO_FAILED'));
    });
    p.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(output);
      else reject(new Error('VIDEO_FAILED'));
    });
  });
}
export async function processVideo(input, dir, watermark, env, { signal, progress } = {}) {
  const bin = binaries(env);
  await copyFile(bin.font, join(dir, 'font.ttf'));
  const metadata = JSON.parse(
    await execute(
      bin.ffprobe,
      [
        '-v',
        'error',
        '-protocol_whitelist',
        'file',
        '-f',
        'mov',
        '-enable_drefs',
        '0',
        '-use_absolute_path',
        '0',
        '-show_streams',
        '-show_format',
        '-of',
        'json',
        input,
      ],
      { cwd: dir, signal },
    ),
  );
  const video = metadata.streams?.find(
      (s) => s.codec_type === 'video' && s.disposition?.attached_pic !== 1,
    ),
    duration = Number(metadata.format?.duration);
  if (
    !video ||
    !Number.isFinite(duration) ||
    duration <= 0 ||
    duration > 14400 ||
    video.width < 32 ||
    video.height < 32 ||
    video.width > 4096 ||
    video.height > 4096 ||
    !watermark.trim() ||
    watermark.length > 120
  )
    throw new Error('VIDEO_FAILED');
  const ratio = Math.min(1, 1920 / video.width, 1080 / video.height);
  const width = Math.floor((video.width * ratio) / 2) * 2;
  const height = Math.floor((video.height * ratio) / 2) * 2;
  const margin = Math.max(2, Math.min(24, width / 16, height / 16));
  const bottom = Math.min(72, height / 5);
  let fontSize = Math.max(2, Math.min(34, height / 32));
  const columns = Math.max(1, Math.floor((width - 4 * margin) / (fontSize * 1.3)));
  const lines = [];
  let line = '';
  for (const word of watermark.trim().split(/\s+/u)) {
    const characters = Array.from(word);
    while (characters.length > columns) {
      if (line) {
        lines.push(line);
        line = '';
      }
      lines.push(characters.splice(0, columns).join(''));
    }
    const rest = characters.join('');
    if (!rest) continue;
    if (line && Array.from(line + ' ' + rest).length > columns) {
      lines.push(line);
      line = rest;
    } else line = line ? line + ' ' + rest : rest;
  }
  if (line) lines.push(line);
  fontSize = Math.max(
    1,
    Math.min(fontSize, (height - bottom - 2 * margin) / (lines.length * 1.35)),
  );
  await writeFile(join(dir, 'title.txt'), lines.join('\n'), 'utf8');
  // Fixed local files, expansion disabled: neither titles nor uploaded filenames enter filter syntax.
  const filter =
    "scale=w='min(1920,iw)':h='min(1080,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2," +
    `drawtext=fontfile=font.ttf:textfile=title.txt:expansion=none:fontsize=${fontSize}:line_spacing=${fontSize * 0.2}:fontcolor=white:box=1:boxcolor=black@0.55:boxborderw=${Math.max(1, margin / 3)}:x=w-tw-${margin}:y=h-th-${bottom}`;
  const output = join(dir, 'processed.mp4');
  await execute(
    bin.ffmpeg,
    [
      '-nostdin',
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-protocol_whitelist',
      'file',
      '-f',
      'mov',
      '-enable_drefs',
      '0',
      '-use_absolute_path',
      '0',
      '-i',
      input,
      '-map',
      '0:v:0',
      '-map',
      '0:a:0?',
      '-vf',
      filter,
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '23',
      '-pix_fmt',
      'yuv420p',
      '-threads',
      '2',
      '-filter_threads',
      '1',
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      '-map_metadata',
      '-1',
      '-map_chapters',
      '-1',
      '-movflags',
      '+faststart',
      '-fs',
      '2147483648',
      '-progress',
      'pipe:1',
      output,
    ],
    {
      cwd: dir,
      signal,
      timeout: 10800000,
      progress: (chunk) => {
        const m = chunk.match(/out_time_us=(\d+)/);
        if (m) progress?.(Math.min(90, 10 + Math.floor((Number(m[1]) / 1000000 / duration) * 80)));
      },
    },
  );
  const result = JSON.parse(
    await execute(
      bin.ffprobe,
      ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', output],
      { cwd: dir, signal },
    ),
  );
  if (Math.abs(Number(result.format.duration) - duration) > 2) throw new Error('VIDEO_FAILED');
  await execute(
    bin.ffmpeg,
    [
      '-nostdin',
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-ss',
      String(Math.min(1, duration / 2)),
      '-i',
      output,
      '-frames:v',
      '1',
      join(dir, 'poster.png'),
    ],
    { cwd: dir, signal },
  );
  const poster = await sharp(join(dir, 'poster.png'))
    .resize({ width: 1800, withoutEnlargement: true })
    .webp({ quality: 85 })
    .toBuffer();
  const image = await sharp(poster).metadata();
  const variants = {
    large: poster,
    small: await sharp(poster)
      .resize({ width: 480, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer(),
    medium: await sharp(poster)
      .resize({ width: 960, withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer(),
  };
  const hash = createHash('sha256');
  for await (const b of createReadStream(output)) hash.update(b);
  const size = (await stat(output)).size;
  if (size >= 2147483648) throw new Error('VIDEO_FAILED');
  return {
    output,
    size,
    duration: Math.ceil(duration),
    sha: hash.digest('hex'),
    width: result.streams.find((s) => s.codec_type === 'video').width,
    height: result.streams.find((s) => s.codec_type === 'video').height,
    posterWidth: image.width,
    posterHeight: image.height,
    variants,
  };
}
async function uploadStream(db, bucket, key, path, signal) {
  const { data, error } = await db.storage
    .from(bucket)
    .createSignedUploadUrl(key, { upsert: true });
  if (error) throw new Error('VIDEO_FAILED');
  const size = (await stat(path)).size;
  const r = await fetch(data.signedUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(size) },
    body: createReadStream(path),
    duplex: 'half',
    signal,
  });
  if (!r.ok) throw new Error('VIDEO_FAILED');
}
export async function videoJob(db, job, env, rpc, signal) {
  const taskDir = await mkdtemp(join(tmpdir(), 'academy-video-'));
  const root = resolve(tmpdir());
  if (!resolve(taskDir).startsWith(root + sep)) throw new Error('VIDEO_FAILED');
  try {
    const signed = await db.storage
      .from('academy-video-source')
      .createSignedUrl(job.payload.original_key, 300);
    if (signed.error) throw new Error('VIDEO_FAILED');
    const response = await fetch(signed.data.signedUrl, { signal });
    if (!response.ok || !response.body) throw new Error('VIDEO_FAILED');
    const path = join(taskDir, 'source.mp4');
    const { open } = await import('node:fs/promises');
    const handle = await open(path, 'wx');
    let size = 0;
    try {
      for await (const chunk of response.body) {
        size += chunk.length;
        if (size > 1073741824 || size > job.payload.size) throw new Error('VIDEO_FAILED');
        await handle.write(chunk);
      }
    } finally {
      await handle.close();
    }
    if (size !== job.payload.size) throw new Error('VIDEO_FAILED');
    const first = Buffer.alloc(12);
    const probe = await open(path, 'r');
    try {
      await probe.read(first, 0, 12, 0);
    } finally {
      await probe.close();
    }
    if (first.toString('ascii', 4, 8) !== 'ftyp') throw new Error('VIDEO_FAILED');
    let lastProgress = 0;
    const processed = await processVideo(path, taskDir, job.payload.watermark, env, {
      signal,
      progress: (value) => {
        if (value > lastProgress + 5) {
          lastProgress = value;
          void rpc('progress', { progress: value }).catch(() => {});
        }
      },
    });
    await rpc('progress', { progress: 92 });
    await uploadStream(db, 'academy-private', job.payload.original_key, processed.output, signal);
    const key = `${job.owner_id}/${job.payload.poster_id}`;
    for (const [suffix, buffer] of [
      ['', processed.variants.large],
      ['.webp', processed.variants.large],
      ['.small.webp', processed.variants.small],
      ['.medium.webp', processed.variants.medium],
    ]) {
      const r = await db.storage
        .from('academy-private')
        .upload(key + suffix, buffer, { contentType: 'image/webp', upsert: true });
      if (r.error) throw new Error('VIDEO_FAILED');
    }
    await rpc('video.commit', {
      size: processed.size,
      duration: processed.duration,
      sha: processed.sha,
      width: processed.width,
      height: processed.height,
      poster_size: processed.variants.large.length,
      poster_width: processed.posterWidth,
      poster_height: processed.posterHeight,
    });
    await db.storage.from('academy-video-source').remove([job.payload.original_key]);
  } finally {
    await rm(taskDir, { recursive: true, force: true });
  }
}
