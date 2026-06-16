import { describe, expect, it } from "vitest";

import { aggressiveFlowRiskScore } from "./crowding";

describe("aggressiveFlowRiskScore", () => {
  it("maps aggressive seller control to positive downside-unwind risk", () => {
    expect(aggressiveFlowRiskScore(100_000, 300_000)).toBe(50);
  });

  it("maps aggressive buyer control to negative upside-squeeze pressure", () => {
    expect(aggressiveFlowRiskScore(300_000, 100_000)).toBe(-50);
  });

  it("is neutral when buyer and seller flow are balanced", () => {
    expect(aggressiveFlowRiskScore(200_000, 200_000)).toBe(0);
  });
});
