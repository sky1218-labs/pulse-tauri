import { describe, it, expect, vi, afterEach } from "vitest";
import { tap } from "../haptics";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("haptics.tap", () => {
  it("vibrates 10ms when navigator.vibrate exists", () => {
    const vibrate = vi.fn();
    vi.stubGlobal("navigator", { vibrate });
    tap();
    expect(vibrate).toHaveBeenCalledTimes(1);
    expect(vibrate).toHaveBeenCalledWith(10);
  });

  it("is a no-op when vibrate is missing", () => {
    vi.stubGlobal("navigator", {});
    expect(() => tap()).not.toThrow();
  });

  it("swallows errors from a throwing vibrate", () => {
    vi.stubGlobal("navigator", {
      vibrate: () => {
        throw new Error("denied");
      },
    });
    expect(() => tap()).not.toThrow();
  });
});
