// Thin wrapper around @google/genai: video upload, structured calls, mock mode.
// Model string comes from the hackathon guide: gemini-4-argon.
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const MODEL = process.env.GEMINI_MODEL || 'gemini-4-argon';
const MOCK = process.argv.includes('--mock') || process.env.TICKETFIX_MOCK === '1';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let _ai = null;

async function client() {
  if (_ai) return _ai;
  const { GoogleGenAI } = await import('@google/genai');
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not set (or run with --mock)');
  _ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return _ai;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Upload cache keyed by sha256 of the video. Lives outside out/ so `npm run reset` doesn't wipe it.
const CACHE = path.join(__dirname, '..', '.cache', 'uploads.json');
const readCache = () => { try { return JSON.parse(fs.readFileSync(CACHE, 'utf8')); } catch { return {}; } };

/** Upload a video via the Files API and wait until it's ACTIVE. Returns a `fileData` part. */
export async function uploadVideo(filePath) {
  if (MOCK) return { text: `[mock video: ${path.basename(filePath)}]` };
  const ai = await client();
  const sha = createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
  const cache = readCache();
  if (cache[sha]) {
    // Files API uploads expire; only reuse one that is still there and ACTIVE.
    const f = await ai.files.get({ name: cache[sha].name }).catch(() => null);
    if (f?.state === 'ACTIVE') return { fileData: { fileUri: f.uri, mimeType: f.mimeType } };
  }
  const mimeType = filePath.endsWith('.webm') ? 'video/webm' : 'video/mp4';
  let file = await ai.files.upload({ file: filePath, config: { mimeType } });
  while (file.state === 'PROCESSING') {
    await sleep(2000);
    file = await ai.files.get({ name: file.name });
  }
  if (file.state === 'FAILED') throw new Error(`video upload failed: ${filePath}`);
  fs.mkdirSync(path.dirname(CACHE), { recursive: true });
  fs.writeFileSync(CACHE, JSON.stringify({ ...readCache(), [sha]: { name: file.name } }, null, 2));
  return { fileData: { fileUri: file.uri, mimeType: file.mimeType } };
}

/**
 * One generateContent call.
 * @param {object} o
 * @param {Array} o.parts   content parts (text / fileData)
 * @param {string} o.system system instruction
 * @param {boolean} o.json  request application/json
 * @param {string} o.mockKey name of fixture in pipeline/mock/<mockKey>.json (mock mode only)
 * @param {boolean} o.think  let the model reason before answering (video stages)
 */
export async function ask({ parts, system, json = false, mockKey, maxOutputTokens, think = false }) {
  if (MOCK) {
    const p = path.join(__dirname, 'mock', `${mockKey}.json`);
    if (!fs.existsSync(p)) throw new Error(`no mock fixture for ${mockKey}`);
    const fixture = JSON.parse(fs.readFileSync(p, 'utf8'));
    // fixtures can be a single response or a list consumed in order (for loops)
    const v = Array.isArray(fixture) ? fixture[mockCalls[mockKey] = (mockCalls[mockKey] ?? -1) + 1] : fixture;
    if (v === undefined) throw new Error(`mock fixture ${mockKey} exhausted`);
    return json ? JSON.stringify(v) : (typeof v === 'string' ? v : JSON.stringify(v));
  }
  const ai = await client();
  const res = await ai.models.generateContent({
    model: MODEL,
    contents: [{ role: 'user', parts }],
    config: {
      systemInstruction: system,
      responseMimeType: json ? 'application/json' : undefined,
      maxOutputTokens: maxOutputTokens ?? undefined,
      temperature: 0.2,
      ...(think ? { thinkingConfig: { thinkingLevel: 'high' } } : {}),
    },
  });
  return res.text;
}
const mockCalls = {};

/** Parse JSON out of a model response, tolerating code fences. */
export function parseJson(text) {
  const t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try { return JSON.parse(t); } catch (e) {
    const m = t.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new Error(`model did not return JSON:\n${text.slice(0, 500)}`);
  }
}

export const isMock = MOCK;
