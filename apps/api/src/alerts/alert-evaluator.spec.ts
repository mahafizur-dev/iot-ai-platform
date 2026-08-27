import { describeBreach, isBreached, type EvaluableRule } from "./alert-evaluator";

function rule(overrides: Partial<EvaluableRule> = {}): EvaluableRule {
  return {
    metric: "temperature",
    condition: "gt",
    threshold: 30,
    thresholdSecondary: null,
    ...overrides,
  };
}

describe("isBreached", () => {
  describe("gt", () => {
    it("fires strictly above the threshold", () => {
      expect(isBreached(rule({ condition: "gt", threshold: 30 }), 30.1)).toBe(true);
      expect(isBreached(rule({ condition: "gt", threshold: 30 }), 30)).toBe(false);
      expect(isBreached(rule({ condition: "gt", threshold: 30 }), 29.9)).toBe(false);
    });
  });

  describe("lt", () => {
    it("fires strictly below the threshold", () => {
      expect(isBreached(rule({ condition: "lt", threshold: 5 }), 4.9)).toBe(true);
      expect(isBreached(rule({ condition: "lt", threshold: 5 }), 5)).toBe(false);
    });

    it("handles negative thresholds", () => {
      expect(isBreached(rule({ condition: "lt", threshold: -10 }), -10.5)).toBe(true);
      expect(isBreached(rule({ condition: "lt", threshold: -10 }), -9)).toBe(false);
    });
  });

  describe("eq", () => {
    it("matches within a float tolerance rather than exactly", () => {
      // 0.1 + 0.2 !== 0.3 in IEEE 754; a device reporting a computed value
      // would never match an exact comparison.
      expect(isBreached(rule({ condition: "eq", threshold: 0.3 }), 0.1 + 0.2)).toBe(true);
    });

    it("does not match a genuinely different value", () => {
      expect(isBreached(rule({ condition: "eq", threshold: 0.3 }), 0.31)).toBe(false);
    });
  });

  describe("range", () => {
    const band = rule({ condition: "range", threshold: 10, thresholdSecondary: 20 });

    it("fires OUTSIDE the band, not inside it", () => {
      expect(isBreached(band, 9.9)).toBe(true);
      expect(isBreached(band, 20.1)).toBe(true);
      expect(isBreached(band, 15)).toBe(false);
    });

    it("treats the bounds themselves as acceptable", () => {
      expect(isBreached(band, 10)).toBe(false);
      expect(isBreached(band, 20)).toBe(false);
    });

    it("tolerates bounds supplied in the wrong order", () => {
      const reversed = rule({ condition: "range", threshold: 20, thresholdSecondary: 10 });
      expect(isBreached(reversed, 15)).toBe(false);
      expect(isBreached(reversed, 25)).toBe(true);
    });

    it("never fires when the upper bound is missing", () => {
      // The DTO rejects this, but a row written by hand must fail closed
      // rather than alerting on every single reading.
      const broken = rule({ condition: "range", threshold: 10, thresholdSecondary: null });
      expect(isBreached(broken, 5)).toBe(false);
      expect(isBreached(broken, 500)).toBe(false);
    });
  });

  describe("defensive cases", () => {
    it("never fires on a non-finite reading", () => {
      expect(isBreached(rule({ condition: "gt", threshold: 30 }), Number.NaN)).toBe(false);
      expect(isBreached(rule({ condition: "gt", threshold: 30 }), Number.POSITIVE_INFINITY)).toBe(false);
    });

    it("never fires on an unknown condition", () => {
      expect(isBreached(rule({ condition: "approximately" }), 999)).toBe(false);
    });
  });
});

describe("describeBreach", () => {
  it("names the metric, the value, and what was violated", () => {
    expect(describeBreach(rule({ condition: "gt", threshold: 30 }), 34)).toBe(
      "temperature is 34 (above 30)",
    );
    expect(describeBreach(rule({ condition: "lt", threshold: 5 }), 2)).toBe(
      "temperature is 2 (below 5)",
    );
    expect(
      describeBreach(rule({ condition: "range", threshold: 10, thresholdSecondary: 20 }), 25),
    ).toBe("temperature is 25 (outside 10–20)");
  });
});
