import { randomBytes } from 'node:crypto';

const devices = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;
const trimEdges = value => value.replace(/^[ .-]+|[ .-]+$/g, '');

export function sanitizeExportName(value) {
  let name = String(value ?? '').normalize('NFC')
    .replace(/[\p{Cc}\p{Cf}]/gu, '')
    .replace(/[<>:"/\\|?*]/g, '-')
    .replace(/\s+/gu, ' ')
    .replace(/-+/g, '-');
  name = trimEdges(name);
  if (!name || name === '.' || name === '..') return '';
  if (devices.test(name)) name = `roadmap-${name}`;
  let result = '';
  for (const point of name) {
    if ([...result].length >= 64 || Buffer.byteLength(result + point, 'utf8') > 120) break;
    result += point;
  }
  return trimEdges(result);
}

export function exportBasename({ title, goal, date = new Date(), suffix = randomBytes(4).toString('hex') }) {
  const readable = sanitizeExportName(title) || sanitizeExportName(goal) || 'Учебный-roadmap';
  const day = date instanceof Date ? date.toISOString().slice(0, 10) : String(date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('Некорректная дата экспорта.');
  if (!/^[a-f0-9]{8}$/i.test(suffix)) throw new Error('Некорректный суффикс экспорта.');
  return `${readable}-${day}-${suffix.toLowerCase()}`;
}
