/** Port of the original Flutter `AudioPathUtils` (lib/core/utils/audio_path_utils.dart). */

/** Normalize separators, resolve `.`/`..` segments, trim — used as the dedupe key everywhere. */
export function canonicalize(filePath: string): string {
  const trimmed = filePath.trim().replace(/\\/g, "/");
  const isAbsolute = trimmed.startsWith("/");
  const segments: string[] = [];
  for (const seg of trimmed.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      segments.pop();
      continue;
    }
    segments.push(seg);
  }
  return (isAbsolute ? "/" : "") + segments.join("/");
}

export function dirname(filePath: string): string {
  const c = canonicalize(filePath);
  const idx = c.lastIndexOf("/");
  if (idx < 0) return ".";
  if (idx === 0) return "/";
  return c.slice(0, idx);
}

export function basename(filePath: string): string {
  const c = canonicalize(filePath);
  return c.slice(c.lastIndexOf("/") + 1);
}

export function basenameWithoutExtension(filePath: string): string {
  const base = basename(filePath);
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(0, dot) : base;
}

export function isUnderFolder(folderPath: string, filePath: string): boolean {
  const folder = canonicalize(folderPath);
  const file = canonicalize(filePath);
  if (file === folder) return false;
  return dirname(file) === folder || file.startsWith(folder + "/");
}

export const AUDIO_EXTENSIONS = ["mp3", "flac", "wav", "aac", "ogg", "m4a"] as const;

export function isAudioPath(filePath: string): boolean {
  const ext = basename(filePath).split(".").pop()?.toLowerCase() ?? "";
  return (AUDIO_EXTENSIONS as readonly string[]).includes(ext);
}
