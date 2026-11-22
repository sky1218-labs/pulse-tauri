/** Port of the original Flutter `TimeParser` (lib/core/utils/time_parser.dart). Durations are milliseconds. */

export function parseTime(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(":");
  const nums = parts.map((p) => (/^\d+$/.test(p.trim()) ? parseInt(p, 10) : NaN));
  if (nums.some((n) => Number.isNaN(n) || n < 0)) return null;
  switch (parts.length) {
    case 1:
      return nums[0] * 1000;
    case 2: {
      const [m, s] = nums;
      if (s >= 60) return null;
      return (m * 60 + s) * 1000;
    }
    case 3: {
      const [h, m, s] = nums;
      if (m >= 60 || s >= 60) return null;
      return (h * 3600 + m * 60 + s) * 1000;
    }
    default:
      return null;
  }
}

export function parseHMS(hours: string, minutes: string, seconds: string): number | null {
  const parse = (v: string) => (v.trim() === "" ? 0 : /^\d+$/.test(v.trim()) ? parseInt(v, 10) : NaN);
  const h = parse(hours), m = parse(minutes), s = parse(seconds);
  if ([h, m, s].some((n) => Number.isNaN(n) || n < 0)) return null;
  if (m >= 60 || s >= 60) return null;
  return (h * 3600 + m * 60 + s) * 1000;
}

export function isValidTime(ms: number, maxMs: number): boolean {
  return ms >= 0 && ms <= maxMs;
}

const pad = (n: number) => String(n).padStart(2, "0");

export function formatTime(ms: number): string {
  const negative = ms < 0;
  const abs = Math.abs(Math.trunc(ms));
  const totalSeconds = Math.floor(abs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const prefix = negative ? "-" : "";
  return hours > 0
    ? `${prefix}${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
    : `${prefix}${pad(minutes)}:${pad(seconds)}`;
}

export const formatDuration = formatTime;

export function formatCompact(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
