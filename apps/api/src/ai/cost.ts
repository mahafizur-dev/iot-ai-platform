/** USD per million tokens, by model prefix. */
interface Pricing {
  input: number;
  output: number;
}

/**
 * Indicative pricing for the cost estimate stored on every interaction
 * (docs/ARCHITECTURE.md §9: "estimated cost ... needed for both audit and
 * cost control"). These are list prices at the time of writing and will drift
 * — the stored number is a spend signal, never a billing record. The provider
 * invoice is authoritative.
 */
const PRICING: { prefix: string; pricing: Pricing }[] = [
  { prefix: "claude-opus", pricing: { input: 15, output: 75 } },
  { prefix: "claude-sonnet", pricing: { input: 3, output: 15 } },
  { prefix: "claude-haiku", pricing: { input: 0.8, output: 4 } },
  { prefix: "claude-fable", pricing: { input: 3, output: 15 } },
];

const UNKNOWN_MODEL_PRICING: Pricing = { input: 0, output: 0 };

export function pricingFor(model: string): Pricing {
  // Longest prefix wins, so "claude-opus-5" cannot be matched by a shorter
  // entry that happens to be listed first.
  const match = [...PRICING]
    .sort((a, b) => b.prefix.length - a.prefix.length)
    .find((entry) => model.startsWith(entry.prefix));

  return match?.pricing ?? UNKNOWN_MODEL_PRICING;
}

/**
 * Returns 0 for an unrecognised model rather than guessing. A zero in the
 * cost column reads as "not priced" and is easy to spot; a fabricated number
 * would quietly corrupt the spend totals it exists to inform.
 */
export function estimateCost(model: string, promptTokens: number, completionTokens: number): number {
  const { input, output } = pricingFor(model);
  const dollars = (promptTokens / 1_000_000) * input + (completionTokens / 1_000_000) * output;

  // Six places: a single short call can land well below a cent.
  return Math.round(dollars * 1_000_000) / 1_000_000;
}
