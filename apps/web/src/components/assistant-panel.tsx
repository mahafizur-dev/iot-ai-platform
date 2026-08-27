"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, RotateCcw, Send, Sparkles, X } from "lucide-react";
import { useAssistant } from "@/lib/assistant-context";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const SUGGESTIONS = [
  "Which devices are offline?",
  "What should I look at first today?",
  "Summarise the open alerts.",
];

function TurnMeta({ meta }: { meta: NonNullable<ReturnType<typeof useAssistant>["turns"][number]["meta"]> }) {
  return (
    <p className="mt-1.5 text-[11px] text-muted-foreground">
      {meta.provider}/{meta.model} · {meta.latencyMs}ms
      {meta.costEstimate > 0 && ` · $${meta.costEstimate.toFixed(4)}`}
    </p>
  );
}

export function AssistantPanel() {
  const { open, busy, turns, closePanel, reset, ask } = useAssistant();
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Follow the conversation as it grows, including while a reply streams in.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, busy]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closePanel();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, closePanel]);

  if (!open) return null;

  const submit = async (message: string) => {
    const trimmed = message.trim();
    if (!trimmed || busy) return;

    setDraft("");
    await ask(trimmed);
  };

  return (
    <>
      {/* Dismisses on click but stays out of the a11y tree — Escape and the
          close button are the real controls. */}
      <div
        className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px]"
        onClick={closePanel}
        aria-hidden
      />

      <aside
        className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l bg-card shadow-xl"
        role="dialog"
        aria-label="AI assistant"
      >
        <header className="flex h-14 shrink-0 items-center justify-between border-b px-4">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" aria-hidden />
            <span className="font-semibold tracking-tight">Assistant</span>
          </div>

          <div className="flex items-center gap-1">
            {turns.length > 0 && (
              <Button variant="ghost" size="icon" onClick={reset} aria-label="Clear conversation">
                <RotateCcw aria-hidden />
              </Button>
            )}
            <Button variant="ghost" size="icon" onClick={closePanel} aria-label="Close assistant">
              <X aria-hidden />
            </Button>
          </div>
        </header>

        <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4">
          {turns.length === 0 && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Ask about your fleet. The assistant only sees your organization&apos;s devices,
                telemetry summaries, and alerts.
              </p>
              <div className="flex flex-col items-start gap-2">
                {SUGGESTIONS.map((suggestion) => (
                  <Button
                    key={suggestion}
                    variant="outline"
                    size="sm"
                    className="h-auto whitespace-normal py-1.5 text-left"
                    onClick={() => void submit(suggestion)}
                  >
                    {suggestion}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {turns.map((turn) => (
            <div
              key={turn.id}
              className={cn("flex", turn.role === "user" ? "justify-end" : "justify-start")}
            >
              <div
                className={cn(
                  "max-w-[85%] rounded-lg px-3 py-2 text-sm",
                  turn.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : turn.failed
                      ? "bg-destructive/10 text-destructive"
                      : "bg-muted",
                )}
                role={turn.failed ? "alert" : undefined}
              >
                <p className="whitespace-pre-wrap">{turn.content}</p>
                {turn.meta && <TurnMeta meta={turn.meta} />}
              </div>
            </div>
          ))}

          {busy && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Thinking…
            </p>
          )}
        </div>

        <form
          className="flex shrink-0 items-center gap-2 border-t p-3"
          onSubmit={(event) => {
            event.preventDefault();
            void submit(draft);
          }}
        >
          <Input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Ask about your fleet…"
            aria-label="Message the assistant"
            disabled={busy}
          />
          <Button type="submit" size="icon" disabled={busy || draft.trim().length === 0}>
            <Send aria-hidden />
            <span className="sr-only">Send</span>
          </Button>
        </form>
      </aside>
    </>
  );
}

export function AssistantTrigger() {
  const { openPanel } = useAssistant();

  return (
    <Button variant="ghost" size="icon" onClick={openPanel} aria-label="Open AI assistant">
      <Sparkles aria-hidden />
    </Button>
  );
}
