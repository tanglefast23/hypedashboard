import { describe, expect, it } from "vitest";
import { formatCompactUsd, formatNumber } from "./format";

describe("format helpers", () => {
  it("uses deterministic compact USD strings without locale ICU differences", () => {
    expect(formatCompactUsd(77_000_000)).toBe("$77M");
    expect(formatCompactUsd(1_234_567_890)).toBe("$1.23B");
  });

  it("uses deterministic compact number strings", () => {
    expect(formatNumber(32_460)).toBe("32.46K");
    expect(formatNumber(20_000_000)).toBe("20M");
  });
});
