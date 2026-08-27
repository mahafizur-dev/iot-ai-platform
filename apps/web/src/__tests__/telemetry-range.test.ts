import { isAggregated, resolveRangeQuery } from "@/lib/telemetry-range";

const NOW = Date.parse("2026-08-27T12:00:00.000Z");

describe("resolveRangeQuery", () => {
  it("asks for raw points on short ranges", () => {
    const query = resolveRangeQuery("1h", "temperature", NOW);

    expect(query).toEqual({
      from: "2026-08-27T11:00:00.000Z",
      to: "2026-08-27T12:00:00.000Z",
      metric: "temperature",
    });
    expect(query.agg).toBeUndefined();
    expect(query.interval).toBeUndefined();
  });

  it("uses the hourly continuous aggregate for a week", () => {
    const query = resolveRangeQuery("7d", "temperature", NOW);

    expect(query.from).toBe("2026-08-20T12:00:00.000Z");
    expect(query).toMatchObject({ agg: "avg", interval: "hour" });
  });

  it("uses the daily continuous aggregate for a month", () => {
    expect(resolveRangeQuery("30d", "temperature", NOW)).toMatchObject({
      agg: "avg",
      interval: "day",
    });
  });

  it("always carries the metric, which the aggregate views group by", () => {
    for (const range of ["1h", "24h", "7d", "30d"] as const) {
      expect(resolveRangeQuery(range, "humidity", NOW).metric).toBe("humidity");
    }
  });

  it("flags exactly the ranges that hit an aggregate view", () => {
    expect(isAggregated("1h")).toBe(false);
    expect(isAggregated("24h")).toBe(false);
    expect(isAggregated("7d")).toBe(true);
    expect(isAggregated("30d")).toBe(true);
  });
});
