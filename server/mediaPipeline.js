import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
const UPSTREAM_TIMEOUT_MS = 180_000;
const TRANSLATION_TIMEOUT_MS = 45_000;
const MYANMAR_UNICODE = /[\u1000-\u109F\uA9E0-\uA9FF\uAA60-\uAA7F]/u;

function configuredEndpoint(endpointPath) {
  const base = process.env.MANUS_API_URL;
  if (!base || !process.env.MANUS_API_KEY) throw Object.assign(new Error('The speech service is not configured.'), { statusCode: 503 });
  const parsed = new URL(base);
  if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw Object.assign(new Error('The speech service is not configured.'), { statusCode: 503 });
  }
  return `${base.replace(/\/+$/, '')}${endpointPath}`;
}

async function upstreamJson(url, init, timeoutMs = UPSTREAM_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal, redirect: 'error' });
    const text = await response.text();
    let body;
    try { body = JSON.parse(text); } catch { throw new Error('The Manus service returned invalid JSON.'); }
    if (!response.ok) throw new Error(body?.error?.message || body?.error || `Manus service returned HTTP ${response.status}.`);
    return body;
  } finally {
    clearTimeout(timer);
  }
}

function runFfmpeg(args, label, timeoutMs = 20 * 60_000) {
  return new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', ...args], { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`${label} exceeded the processing time limit.`));
    }, timeoutMs);
    child.stderr.on('data', (chunk) => { stderr = (stderr + chunk.toString()).slice(-4000); });
    child.once('error', (error) => { clearTimeout(timer); reject(new Error(`${label} could not start: ${error.message}`)); });
    child.once('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`${label} failed${stderr ? `: ${stderr.trim()}` : ` with exit code ${code}`}`));
    });
  });
}

function srtTime(seconds) {
  const milliseconds = Math.max(0, Math.round(Number(seconds) * 1000));
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor((milliseconds % 3_600_000) / 60_000);
  const secs = Math.floor((milliseconds % 60_000) / 1000);
  const millis = milliseconds % 1000;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(millis).padStart(3, '0')}`;
}

function escapeSrt(text) {
  return String(text).replace(/\r?\n/g, '\\N');
}

// At 640×360 the Myanmar comma and full stop become visually ambiguous after
// video encoding. Use one unambiguous sentence mark in both SRT and MP4.
function normalizeSubtitleText(text) {
  return String(text).replace(/၊/gu, '။');
}

async function transcribe(audioBuffer) {
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(audioBuffer)], { type: 'audio/wav' }), 'audio.wav');
  form.append('model', 'whisper-large-v3');
  form.append('response_format', 'verbose_json');
  form.append('prompt', 'Transcribe the spoken audio faithfully in its original language. Preserve wording, punctuation, and the speaker\'s language; do not translate or summarize. Output perfect Myanmar (Burmese) Unicode for each caption. Use correct Myanmar letter combinations and proper grammar. Do not machine-translate word by word; ensure natural Myanmar sentence structure. Double-check spelling and grammar to ensure native-level accuracy.');
  const result = await upstreamJson(configuredEndpoint('/audio/transcriptions'), {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.MANUS_API_KEY}` },
    body: form,
  });
  if (!Array.isArray(result.segments)) throw new Error('The speech service returned no timed segments.');
  return result.segments.map((segment, index) => ({
    id: `server-${index + 1}`,
    start: Number(segment.start),
    end: Number(segment.end),
    text: String(segment.text || '').trim(),
  })).filter((segment) => segment.text && Number.isFinite(segment.start) && Number.isFinite(segment.end));
}

async function translateOne(segment) {
  const result = await upstreamJson(configuredEndpoint('/v1/chat/completions'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.MANUS_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama3-70b-8192',
      max_completion_tokens: 2048,
      messages: [
        {
          role: 'system',
          content: 'Translate the following English text accurately into Myanmar. Do not summarize. Do not skip any words. Preserve meaning, tone, names, and punctuation. Use correct Myanmar spelling, letter combinations, and grammar. Double-check spelling and grammar to ensure native-level accuracy. Use Myanmar script and return only the translated text.',
        },
        {
          role: 'user',
          content: segment.text,
        },
      ],
    }),
  }, TRANSLATION_TIMEOUT_MS);

  const text = result.choices?.[0]?.message?.content?.trim();

  if (!text || !MYANMAR_UNICODE.test(text)) {
    throw new Error('Translation did not contain Myanmar script.');
  }

  return text
    .replace(/^```(?:text|markdown)?\s*/i, '')
    .replace(/\s*```$/u, '')
    .trim();
}

async function translateCaptions(transcript) {
  const captions = [];
  for (let index = 0; index < transcript.length; index += 1) {
    const segment = transcript[index];
    let myanmarText = '';
    try {
      myanmarText = normalizeSubtitleText(await translateOne(segment));
    } catch {
      try {
        myanmarText = normalizeSubtitleText(await translateOne(segment));
      } catch {
        myanmarText = '';
      }
    }
    captions.push({ ...segment, myanmarText });
    if (index < transcript.length - 1) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  return captions;
}

function subtitleFilterPath(filePath) {
  return filePath.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");
}

export async function processVideo({ videoBuffer, originalName }) {
  if (!Buffer.isBuffer(videoBuffer) || videoBuffer.length === 0 || videoBuffer.length > MAX_VIDEO_BYTES) {
    throw Object.assign(new Error('Upload one video no larger than 100 MiB.'), { statusCode: 400 });
  }
  const jobDirectory = await mkdtemp(path.join(os.tmpdir(), 'recap-studio-'));
  const safeStem = path.basename(originalName || 'recap-video').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/\.+$/u, '') || 'recap-video';
  const inputPath = path.join(jobDirectory, `${safeStem}.mp4`);
  const audioPath = path.join(jobDirectory, 'speech.wav');
  const srtPath = path.join(jobDirectory, 'captions.srt');
  const outputPath = path.join(jobDirectory, `${safeStem}-myanmar.mp4`);
  try {
    await writeFile(inputPath, videoBuffer, { flag: 'wx' });
    await runFfmpeg(['-y', '-i', inputPath, '-vn', '-map', '0:a:0', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', audioPath], 'Audio extraction');
    const transcript = await transcribe(await readFile(audioPath));
    if (transcript.length === 0) throw new Error('No speech segments were returned for this video.');
    const captions = await translateCaptions(transcript);
    const srt = captions.map((caption, index) => [
      String(index + 1),
      `${srtTime(caption.start)} --> ${srtTime(Math.max(caption.end, caption.start + 0.2))}`,
      escapeSrt(caption.myanmarText),
      '',
    ].join('\n')).join('\n');
    await writeFile(srtPath, srt, 'utf8');
    const fontDir = process.env.RECAP_FONT_DIR || './fonts';
    const subtitleFilter = `subtitles=filename='${subtitleFilterPath(srtPath)}':fontsdir='${subtitleFilterPath(fontDir)}':force_style='FontName=Noto Serif Myanmar,FontSize=18,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=3,Outline=1,Shadow=0,MarginV=20,Alignment=2,WrapStyle=2'`;
    await runFfmpeg(['-y', '-i', inputPath, '-vf', subtitleFilter, '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '22', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', outputPath], 'Myanmar subtitle rendering');
    return { outputPath, downloadName: `${safeStem}-myanmar.mp4`, captions, srt, cleanup: () => rm(jobDirectory, { recursive: true, force: true }) };
  } catch (error) {
    await rm(jobDirectory, { recursive: true, force: true });
    throw error;
  }
}

export { MAX_VIDEO_BYTES };
