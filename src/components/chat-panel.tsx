"use client";
import { useState, useTransition } from "react";
import { postDiscordReminder, postLanToDiscord } from "@/app/actions";
import { btnSecondary } from "./ui";

type Kind = "signup" | "payment" | "event";

export function DiscordButtons({
  lanId,
  posted,
  channels,
  kinds,
}: {
  lanId: string;
  posted: number;
  channels: number;
  kinds: { kind: Kind; label: string }[];
}) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button
          className={btnSecondary}
          disabled={pending || !channels}
          onClick={() =>
            start(async () => {
              const n = await postLanToDiscord(lanId);
              setMsg(n ? `Posted to ${n} channel(s).` : "Already posted everywhere, the attendee list was refreshed.");
            })
          }
        >
          {posted < channels ? "Post announcement" : "Refresh announcement"}
        </button>
        {kinds.map((k) => (
          <button
            key={k.kind}
            className={btnSecondary}
            disabled={pending || !channels}
            onClick={() => {
              if (!confirm(`Post the "${k.label}" reminder to ${channels} Discord channel(s) now? It pings the members it applies to.`)) return;
              start(async () => {
                const n = await postDiscordReminder(lanId, k.kind);
                setMsg(`Posted "${k.label}" to ${n} channel(s).`);
              });
            }}
          >
            Post: {k.label}
          </button>
        ))}
      </div>
      {msg && <p className="text-sm text-emerald-300">{msg}</p>}
    </div>
  );
}

export function WhatsAppTexts({ texts }: { texts: { kind: string; label: string; text: string }[] }) {
  const [active, setActive] = useState(texts[0]?.kind);
  const [copied, setCopied] = useState(false);
  const current = texts.find((t) => t.kind === active) ?? texts[0];
  if (!current) return null;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {texts.map((t) => (
          <button
            key={t.kind}
            onClick={() => {
              setActive(t.kind);
              setCopied(false);
            }}
            className={`rounded-md px-2 py-1 text-xs ${t.kind === current.kind ? "bg-zinc-700 text-zinc-100" : "text-zinc-400 hover:bg-zinc-800"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <textarea
        readOnly
        value={current.text}
        rows={Math.min(14, current.text.split("\n").length + 1)}
        className="w-full rounded-md border border-zinc-700 bg-zinc-950 p-3 font-mono text-xs text-zinc-200"
      />
      <div className="flex flex-wrap gap-2">
        <button
          className={btnSecondary}
          onClick={async () => {
            await navigator.clipboard.writeText(current.text);
            setCopied(true);
          }}
        >
          {copied ? "Copied ✓" : "Copy text"}
        </button>
        <a
          className={btnSecondary}
          href={`https://wa.me/?text=${encodeURIComponent(current.text)}`}
          target="_blank"
          rel="noreferrer"
        >
          Share via WhatsApp
        </a>
      </div>
    </div>
  );
}
