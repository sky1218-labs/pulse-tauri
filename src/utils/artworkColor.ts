import { useEffect, useState } from "react";

/**
 * Artwork → ambient colour for the Now Playing backdrop.
 *
 * The average colour of the current track's artwork is desaturated and
 * darkened toward black until white text on it keeps WCAG AA contrast
 * (≥ 4.5:1). Results are cached in memory per artwork src — extraction
 * runs once per artwork, never on the play-tap path, and nothing is
 * persisted (the library schema is untouched).
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

const WHITE: Rgb = { r: 255, g: 255, b: 255 };

/** sRGB relative luminance (WCAG 2.x). */
export function relativeLuminance({ r, g, b }: Rgb): number {
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio between two colours (1–21). */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Darken a colour for use as the Now Playing ambient gradient stop:
 * desaturate 30% toward its own luma, scale toward black, then keep
 * scaling (×0.85 steps) until white text on it reaches 4.5:1 contrast.
 */
export function darkenForAmbient({ r, g, b }: Rgb): Rgb {
  const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const desat = (v: number) => v + (luma - v) * 0.3;
  let scale = 0.35;
  let out: Rgb = { r: desat(r) * scale, g: desat(g) * scale, b: desat(b) * scale };
  for (let i = 0; i < 10 && contrastRatio(WHITE, out) < 4.5 && scale > 0.02; i++) {
    scale *= 0.85;
    out = { r: desat(r) * scale, g: desat(g) * scale, b: desat(b) * scale };
  }
  return {
    r: Math.round(Math.min(255, Math.max(0, out.r))),
    g: Math.round(Math.min(255, Math.max(0, out.g))),
    b: Math.round(Math.min(255, Math.max(0, out.b))),
  };
}

export function rgbToCss({ r, g, b }: Rgb): string {
  return `rgb(${r}, ${g}, ${b})`;
}

const cache = new Map<string, Promise<string | null>>();

/** Ambient gradient colour (CSS rgb()) for an artwork src, or null when
 *  extraction is impossible (load error, tainted canvas, …). Cached. */
export function getArtworkAmbient(src: string): Promise<string | null> {
  const hit = cache.get(src);
  if (hit) return hit;
  const pending = (async () => {
    try {
      const { FastAverageColor } = await import("fast-average-color");
      const fac = new FastAverageColor();
      const color = await fac.getColorAsync(src);
      fac.destroy();
      const [r, g, b] = color.value;
      return rgbToCss(darkenForAmbient({ r, g, b }));
    } catch {
      return null;
    }
  })();
  cache.set(src, pending);
  return pending;
}

/** React hook: the ambient colour for the given artwork src (null while
 *  loading, when there is no artwork, or when extraction fails). */
export function useArtworkAmbient(src: string | undefined): string | null {
  const [ambient, setAmbient] = useState<string | null>(null);
  useEffect(() => {
    if (!src) {
      setAmbient(null);
      return;
    }
    let alive = true;
    void getArtworkAmbient(src).then((color) => {
      if (alive) setAmbient(color);
    });
    return () => {
      alive = false;
    };
  }, [src]);
  return ambient;
}
