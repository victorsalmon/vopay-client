import { createHash } from 'node:crypto';

export function sha1(value: string): string {
  return createHash('sha1').update(value, 'utf8').digest('hex');
}

export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export function firstString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return null;
}
