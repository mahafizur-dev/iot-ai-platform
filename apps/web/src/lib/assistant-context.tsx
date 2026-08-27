"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import type { AnalyticsRange } from "@iot-ai-platform/shared-types";
import {
  askAssistant,
  explainAlert as explainAlertCall,
  summarizeDeviceTelemetry,
  ApiError,
  type AIChatMessage,
  type AIResult,
} from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";

export interface AssistantTurn {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** Present on assistant turns that came back from a real call. */
  meta?: { model: string; provider: string; latencyMs: number; costEstimate: number };
  failed?: boolean;
}

interface AssistantState {
  open: boolean;
  busy: boolean;
  turns: AssistantTurn[];
  openPanel: () => void;
  closePanel: () => void;
  reset: () => void;
  ask: (message: string) => Promise<void>;
  explainAlert: (alertId: string, label: string) => Promise<void>;
  summarizeDevice: (deviceId: string, label: string, range: AnalyticsRange) => Promise<void>;
}

const AssistantContext = createContext<AssistantState | null>(null);

/** Only the last few turns are worth sending back; the server caps this too. */
const HISTORY_TURNS = 6;

function errorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 429) {
    return "You're sending requests faster than the AI rate limit allows. Wait a moment and try again.";
  }

  return error instanceof Error ? error.message : "The assistant could not answer.";
}

/**
 * Shared assistant state, so the panel can be driven from anywhere — the
 * header, an alert row's "Explain" button, a device's "Summarise" button —
 * without each caller owning its own conversation.
 */
export function AssistantProvider({ children }: { children: React.ReactNode }) {
  const { withAuth } = useAuth();

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [turns, setTurns] = useState<AssistantTurn[]>([]);

  // Ids only need to be unique within one session's list.
  const nextId = useRef(0);
  const makeId = () => String(nextId.current++);

  const append = useCallback((turn: Omit<AssistantTurn, "id">) => {
    setTurns((current) => [...current, { ...turn, id: makeId() }]);
  }, []);

  /**
   * Every entry point follows the same shape: show the user's turn, open the
   * panel, call, then append the answer or the failure. Keeping it in one
   * place is what stops the three buttons drifting apart.
   */
  const run = useCallback(
    async (userTurn: string, call: (token: string) => Promise<AIResult>) => {
      setOpen(true);
      setBusy(true);
      append({ role: "user", content: userTurn });

      try {
        const result = await withAuth(call);
        append({
          role: "assistant",
          content: result.text,
          meta: {
            model: result.model,
            provider: result.provider,
            latencyMs: result.latencyMs,
            costEstimate: result.costEstimate,
          },
        });
      } catch (error) {
        append({ role: "assistant", content: errorMessage(error), failed: true });
      } finally {
        setBusy(false);
      }
    },
    [withAuth, append],
  );

  const ask = useCallback(
    async (message: string) => {
      // Read history before the user's turn is appended, so the message isn't
      // sent twice — once as history, once as the prompt.
      const history: AIChatMessage[] = turns
        .filter((turn) => !turn.failed)
        .slice(-HISTORY_TURNS)
        .map((turn) => ({ role: turn.role, content: turn.content }));

      await run(message, (token) => askAssistant(token, message, history));
    },
    [run, turns],
  );

  const explainAlert = useCallback(
    async (alertId: string, label: string) => {
      await run(`Explain the alert: ${label}`, (token) => explainAlertCall(token, alertId));
    },
    [run],
  );

  const summarizeDevice = useCallback(
    async (deviceId: string, label: string, range: AnalyticsRange) => {
      await run(`Summarise ${label} over the last ${range}`, (token) =>
        summarizeDeviceTelemetry(token, deviceId, range),
      );
    },
    [run],
  );

  const value = useMemo(
    () => ({
      open,
      busy,
      turns,
      openPanel: () => setOpen(true),
      closePanel: () => setOpen(false),
      reset: () => setTurns([]),
      ask,
      explainAlert,
      summarizeDevice,
    }),
    [open, busy, turns, ask, explainAlert, summarizeDevice],
  );

  return <AssistantContext.Provider value={value}>{children}</AssistantContext.Provider>;
}

export function useAssistant(): AssistantState {
  const context = useContext(AssistantContext);

  if (!context) {
    throw new Error("useAssistant must be used within an AssistantProvider");
  }

  return context;
}
