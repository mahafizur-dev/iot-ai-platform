import { formatCount, formatDuration, formatPercent, uptimeVariant } from "@/lib/analytics";

describe("formatDuration", () => {
  it("scales the unit with the magnitude", () => {
    expect(formatDuration(45)).toBe("45s");
    expect(formatDuration(90)).toBe("1m");
    expect(formatDuration(3900)).toBe("1h 5m");
    expect(formatDuration(7200)).toBe("2h");
    expect(formatDuration(90_000)).toBe("1d 1h");
  });

  it("renders a placeholder when there is nothing to average", () => {
    // MTTA/MTTR come back null when no alert was acknowledged or resolved.
    expect(formatDuration(null)).toBe("—");
    expect(formatDuration(Number.NaN)).toBe("—");
  });
});

describe("formatPercent", () => {
  it("renders a ratio with one decimal by default", () => {
    expect(formatPercent(0.9987)).toBe("99.9%");
    expect(formatPercent(1)).toBe("100.0%");
    expect(formatPercent(0)).toBe("0.0%");
  });

  it("honours an explicit precision", () => {
    expect(formatPercent(0.4567, 0)).toBe("46%");
  });

  it("renders a placeholder for a null fleet ratio", () => {
    // An org with no devices has no meaningful average.
    expect(formatPercent(null)).toBe("—");
  });
});

describe("uptimeVariant", () => {
  it("bands uptime into success, warning, and destructive", () => {
    expect(uptimeVariant(1)).toBe("success");
    expect(uptimeVariant(0.99)).toBe("success");
    expect(uptimeVariant(0.98)).toBe("warning");
    expect(uptimeVariant(0.95)).toBe("warning");
    expect(uptimeVariant(0.9499)).toBe("destructive");
    expect(uptimeVariant(0)).toBe("destructive");
  });
});

describe("formatCount", () => {
  it("abbreviates large counts and leaves small ones alone", () => {
    expect(formatCount(0)).toBe("0");
    expect(formatCount(999)).toBe("999");
    expect(formatCount(1234)).toBe("1.2k");
    expect(formatCount(2_500_000)).toBe("2.5M");
  });
});
