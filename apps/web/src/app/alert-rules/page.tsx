"use client";

import { useEffect, useState } from "react";
import { SlidersHorizontal, Trash2 } from "lucide-react";
import type { AlertRuleResponse } from "@iot-ai-platform/shared-types";
import {
  deleteAlertRule,
  fetchAlertRules,
  fetchDevicePage,
  updateAlertRule,
  type DeviceResponse,
} from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { describeRule, severityVariant } from "@/lib/alerts";
import { RequireAuth } from "@/components/RequireAuth";
import { EmptyState } from "@/components/empty-state";
import { AlertRuleForm } from "@/components/alert-rule-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function AlertRulesScreen() {
  const { user, withAuth } = useAuth();

  const [rules, setRules] = useState<AlertRuleResponse[] | null>(null);
  const [devices, setDevices] = useState<DeviceResponse[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  const canWrite = user?.permissions.includes("alert:write") ?? false;

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      withAuth((token) => fetchAlertRules(token)),
      withAuth((token) => fetchDevicePage(token, { limit: 100 })),
    ])
      .then(([loadedRules, devicePage]) => {
        if (cancelled) return;
        setRules(loadedRules);
        setDevices(devicePage.items);
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "Failed to load rules");
      });

    return () => {
      cancelled = true;
    };
  }, [withAuth]);

  const toggle = async (rule: AlertRuleResponse) => {
    setPending(rule.id);
    setError(null);

    try {
      const updated = await withAuth((token) =>
        updateAlertRule(token, rule.id, { enabled: !rule.enabled }),
      );
      setRules((current) =>
        current ? current.map((item) => (item.id === rule.id ? updated : item)) : current,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update the rule");
    } finally {
      setPending(null);
    }
  };

  const remove = async (rule: AlertRuleResponse) => {
    setPending(rule.id);
    setError(null);

    try {
      await withAuth((token) => deleteAlertRule(token, rule.id));
      setRules((current) => (current ? current.filter((item) => item.id !== rule.id) : current));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not delete the rule");
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Alert rules</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          A rule with no device applies to every device in your organization.
        </p>
      </div>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      {canWrite && (
        <AlertRuleForm
          devices={devices}
          onCreated={(rule) => setRules((current) => [rule, ...(current ?? [])])}
        />
      )}

      <Card>
        <CardContent className="p-0">
          {rules === null ? (
            <div className="space-y-2 p-6">
              {Array.from({ length: 3 }, (_, index) => (
                <Skeleton key={index} className="h-10 w-full" />
              ))}
            </div>
          ) : rules.length === 0 ? (
            <EmptyState
              icon={SlidersHorizontal}
              title="No rules yet"
              description={
                canWrite
                  ? "Create one above and it starts evaluating on the next reading."
                  : "Your role does not include alert:write."
              }
              className="m-6 border-0"
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rule</TableHead>
                  <TableHead>Applies to</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Enabled</TableHead>
                  {canWrite && <TableHead className="text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules.map((rule) => (
                  <TableRow key={rule.id}>
                    <TableCell className="font-medium">{describeRule(rule)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {rule.deviceName ?? "All devices"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={severityVariant(rule.severity)} className="capitalize">
                        {rule.severity}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {canWrite ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={pending === rule.id}
                          onClick={() => void toggle(rule)}
                          aria-pressed={rule.enabled}
                        >
                          {rule.enabled ? "Enabled" : "Disabled"}
                        </Button>
                      ) : (
                        <span className="text-muted-foreground">
                          {rule.enabled ? "Enabled" : "Disabled"}
                        </span>
                      )}
                    </TableCell>
                    {canWrite && (
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={pending === rule.id}
                          onClick={() => void remove(rule)}
                          aria-label={`Delete rule ${describeRule(rule)}`}
                        >
                          <Trash2 aria-hidden />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function AlertRulesPage() {
  return (
    <RequireAuth>
      <AlertRulesScreen />
    </RequireAuth>
  );
}
