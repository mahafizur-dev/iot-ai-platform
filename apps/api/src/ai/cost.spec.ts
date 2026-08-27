import { estimateCost, pricingFor } from "./cost";

describe("pricingFor", () => {
  it("matches a model to its family by prefix", () => {
    expect(pricingFor("claude-sonnet-5")).toEqual({ input: 3, output: 15 });
    expect(pricingFor("claude-opus-5")).toEqual({ input: 15, output: 75 });
    expect(pricingFor("claude-haiku-4-5-20251001")).toEqual({ input: 0.8, output: 4 });
  });

  it("prefers the longest matching prefix", () => {
    // A dated snapshot must still resolve to its family, not to whichever
    // shorter entry happens to be listed first.
    expect(pricingFor("claude-sonnet-5-20260101")).toEqual({ input: 3, output: 15 });
  });

  it("returns zero pricing for an unrecognised model", () => {
    expect(pricingFor("some-other-vendor-model")).toEqual({ input: 0, output: 0 });
  });
});

describe("estimateCost", () => {
  it("prices input and output tokens separately", () => {
    // 1M input at $3 + 1M output at $15.
    expect(estimateCost("claude-sonnet-5", 1_000_000, 1_000_000)).toBe(18);
  });

  it("keeps enough precision for a single short call", () => {
    // 1200 in / 400 out on Sonnet = 0.0036 + 0.006.
    expect(estimateCost("claude-sonnet-5", 1200, 400)).toBe(0.0096);
  });

  it("returns zero rather than guessing for an unknown model", () => {
    // A fabricated number would quietly corrupt the spend totals this exists
    // to inform; a zero reads as "not priced" and is easy to spot.
    expect(estimateCost("mock-echo-1", 5000, 5000)).toBe(0);
  });

  it("handles a zero-token call", () => {
    expect(estimateCost("claude-sonnet-5", 0, 0)).toBe(0);
  });
});
