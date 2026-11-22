import { describe, expect, it } from "vitest";
import {
  contrastRatio,
  darkenForAmbient,
  relativeLuminance,
  rgbToCss,
  type Rgb,
} from "../artworkColor";

const WHITE: Rgb = { r: 255, g: 255, b: 255 };
const BLACK: Rgb = { r: 0, g: 0, b: 0 };

describe("relativeLuminance", () => {
  it("is 0 for black and 1 for white", () => {
    expect(relativeLuminance(BLACK)).toBe(0);
    expect(relativeLuminance(WHITE)).toBeCloseTo(1, 10);
  });

  it("weights green highest (WCAG coefficients)", () => {
    const g = relativeLuminance({ r: 0, g: 255, b: 0 });
    const r = relativeLuminance({ r: 255, g: 0, b: 0 });
    const b = relativeLuminance({ r: 0, g: 0, b: 255 });
    expect(g).toBeGreaterThan(r);
    expect(r).toBeGreaterThan(b);
  });
});

describe("contrastRatio", () => {
  it("is 21 for white on black, 1 for identical colours", () => {
    expect(contrastRatio(WHITE, BLACK)).toBeCloseTo(21, 5);
    expect(contrastRatio(WHITE, WHITE)).toBeCloseTo(1, 10);
  });

  it("is symmetric", () => {
    const c: Rgb = { r: 0, g: 112, b: 243 };
    expect(contrastRatio(c, WHITE)).toBeCloseTo(contrastRatio(WHITE, c), 10);
  });
});

describe("darkenForAmbient", () => {
  it("keeps black black", () => {
    expect(darkenForAmbient(BLACK)).toEqual(BLACK);
  });

  it("darkens white to a neutral grey with AA contrast for white text", () => {
    const out = darkenForAmbient(WHITE);
    expect(out.r).toBe(out.g);
    expect(out.g).toBe(out.b);
    expect(out.r).toBeLessThan(120);
    expect(contrastRatio(WHITE, out)).toBeGreaterThanOrEqual(4.5);
  });

  it("never raises the peak channel and always lowers luminance", () => {
    // Desaturation pulls low channels toward the luma, so a zero channel
    // may rise slightly — but the peak channel and the overall luminance
    // must strictly fall.
    const samples: Rgb[] = [
      { r: 255, g: 0, b: 0 },
      { r: 12, g: 200, b: 90 },
      { r: 250, g: 240, b: 230 },
      { r: 0, g: 112, b: 243 },
    ];
    for (const c of samples) {
      const out = darkenForAmbient(c);
      expect(Math.max(out.r, out.g, out.b)).toBeLessThanOrEqual(Math.max(c.r, c.g, c.b));
      expect(relativeLuminance(out)).toBeLessThan(relativeLuminance(c));
    }
  });

  it("guarantees ≥4.5:1 contrast for white text, even for bright yellow", () => {
    const hard: Rgb[] = [
      { r: 255, g: 255, b: 0 },
      { r: 0, g: 255, b: 255 },
      { r: 255, g: 200, b: 40 },
      { r: 180, g: 255, b: 180 },
    ];
    for (const c of hard) {
      expect(contrastRatio(WHITE, darkenForAmbient(c))).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("desaturates: output channels are closer together than the input's", () => {
    const spread = (c: Rgb) => Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b);
    const input: Rgb = { r: 240, g: 30, b: 60 };
    expect(spread(darkenForAmbient(input))).toBeLessThan(spread(input));
  });

  it("clamps output to integer 0–255 channels", () => {
    const out = darkenForAmbient({ r: 255, g: 128, b: 3 });
    for (const v of [out.r, out.g, out.b]) {
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(255);
    }
  });
});

describe("rgbToCss", () => {
  it("formats an rgb() string", () => {
    expect(rgbToCss({ r: 0, g: 112, b: 243 })).toBe("rgb(0, 112, 243)");
  });
});
