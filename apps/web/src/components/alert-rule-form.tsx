"use client";

import { useState } from "react";
import { Loader2, Plus } from "lucide-react";
import {
  ALERT_CONDITIONS,
  ALERT_SEVERITIES,
  type AlertRuleResponse,
} from "@iot-ai-platform/shared-types";
import { createAlertRule, type AlertRuleInput, type DeviceResponse } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const SELECT_CLASS =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

export function AlertRuleForm({
  devices,
  onCreated,
}: {
  devices: DeviceResponse[];
  onCreated: (rule: AlertRuleResponse) => void;
}) {
  const { withAuth } = useAuth();

  const [deviceId, setDeviceId] = useState("");
  const [metric, setMetric] = useState("");
  const [condition, setCondition] = useState<string>("gt");
  const [threshold, setThreshold] = useState("");
  const [thresholdSecondary, setThresholdSecondary] = useState("");
  const [severity, setSeverity] = useState<string>("warning");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isRange = condition === "range";

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    const input: AlertRuleInput = {
      // An empty select value means "all devices", which the API models as an
      // absent deviceId rather than an empty string.
      ...(deviceId ? { deviceId } : {}),
      metric: metric.trim(),
      condition,
      threshold: Number(threshold),
      ...(isRange ? { thresholdSecondary: Number(thresholdSecondary) } : {}),
      severity,
    };

    try {
      const rule = await withAuth((token) => createAlertRule(token, input));
      onCreated(rule);
      setMetric("");
      setThreshold("");
      setThresholdSecondary("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create the rule");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>New rule</CardTitle>
        <CardDescription>
          Evaluated against every reading as it arrives, and re-checked once a minute.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="rule-device">Device</Label>
            <select
              id="rule-device"
              className={SELECT_CLASS}
              value={deviceId}
              onChange={(event) => setDeviceId(event.target.value)}
            >
              <option value="">All devices</option>
              {devices.map((device) => (
                <option key={device.id} value={device.id}>
                  {device.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="rule-metric">Metric</Label>
            <Input
              id="rule-metric"
              required
              placeholder="temperature"
              value={metric}
              onChange={(event) => setMetric(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="rule-condition">Condition</Label>
            <select
              id="rule-condition"
              className={SELECT_CLASS}
              value={condition}
              onChange={(event) => setCondition(event.target.value)}
            >
              {ALERT_CONDITIONS.map((option) => (
                <option key={option} value={option}>
                  {
                    {
                      gt: "greater than",
                      lt: "less than",
                      eq: "equal to",
                      range: "outside range",
                    }[option]
                  }
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="rule-threshold">{isRange ? "Lower bound" : "Threshold"}</Label>
            <Input
              id="rule-threshold"
              type="number"
              step="any"
              required
              value={threshold}
              onChange={(event) => setThreshold(event.target.value)}
            />
          </div>

          {isRange && (
            <div className="space-y-2">
              <Label htmlFor="rule-threshold-secondary">Upper bound</Label>
              <Input
                id="rule-threshold-secondary"
                type="number"
                step="any"
                required
                value={thresholdSecondary}
                onChange={(event) => setThresholdSecondary(event.target.value)}
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="rule-severity">Severity</Label>
            <select
              id="rule-severity"
              className={SELECT_CLASS}
              value={severity}
              onChange={(event) => setSeverity(event.target.value)}
            >
              {ALERT_SEVERITIES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>

          {error && (
            <p className="text-sm text-destructive sm:col-span-2 lg:col-span-3" role="alert">
              {error}
            </p>
          )}

          <div className="sm:col-span-2 lg:col-span-3">
            <Button type="submit" disabled={submitting}>
              {submitting ? <Loader2 className="animate-spin" aria-hidden /> : <Plus aria-hidden />}
              Create rule
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
