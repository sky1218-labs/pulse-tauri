import { describe, it, expect } from "vitest";
import { hintVersion } from "../updateCheck";

describe("hintVersion", () => {
  it("hints when latest is newer", () => {
    expect(hintVersion("0.3.0", null, "0.2.5")).toBe("0.3.0");
  });
  it("no hint when up to date or older", () => {
    expect(hintVersion("0.2.5", null, "0.2.5")).toBeNull();
    expect(hintVersion("0.2.4", null, "0.2.5")).toBeNull();
    expect(hintVersion(null, null, "0.2.5")).toBeNull();
  });
  it("dismissed version suppresses the hint, a newer one reappears", () => {
    expect(hintVersion("0.3.0", "0.3.0", "0.2.5")).toBeNull();
    expect(hintVersion("0.3.1", "0.3.0", "0.2.5")).toBe("0.3.1");
  });
});
