import { describe, it, expect, vi } from "vitest";
import { BackNavRegistry } from "../backNav";

describe("BackNavRegistry", () => {
  it("returns false when no handler is registered (Android may exit)", () => {
    expect(new BackNavRegistry().handleBack()).toBe(false);
  });

  it("asks the most recently registered handler first (dialog beats router)", () => {
    const r = new BackNavRegistry();
    const router = vi.fn(() => true);
    const dialog = vi.fn(() => true);
    r.register(router); // shell router registers first = lowest priority
    r.register(dialog); // dialog mounts later = asked first
    expect(r.handleBack()).toBe(true);
    expect(dialog).toHaveBeenCalledTimes(1);
    expect(router).not.toHaveBeenCalled();
  });

  it("falls through to the next handler when the top one declines", () => {
    const r = new BackNavRegistry();
    const router = vi.fn(() => true);
    const dialog = vi.fn(() => false);
    r.register(router);
    r.register(dialog);
    expect(r.handleBack()).toBe(true);
    expect(router).toHaveBeenCalledTimes(1);
  });

  it("unregistered handlers are no longer asked", () => {
    const r = new BackNavRegistry();
    const dialog = vi.fn(() => true);
    const off = r.register(dialog);
    off();
    expect(r.size).toBe(0);
    expect(r.handleBack()).toBe(false);
    expect(dialog).not.toHaveBeenCalled();
  });

  it("a throwing handler does not trap the back button", () => {
    const r = new BackNavRegistry();
    r.register(() => true);
    r.register(() => { throw new Error("boom"); });
    expect(r.handleBack()).toBe(true);
  });

  it("nested dialogs close one per press, topmost first", () => {
    const r = new BackNavRegistry();
    const closed: string[] = [];
    r.register(() => { closed.push("router"); return true; });
    const offOuter = r.register(() => { closed.push("outer"); offOuter(); return true; });
    const offInner = r.register(() => { closed.push("inner"); offInner(); return true; });
    expect(r.handleBack()).toBe(true);
    expect(r.handleBack()).toBe(true);
    expect(closed).toEqual(["inner", "outer"]);
  });
});
