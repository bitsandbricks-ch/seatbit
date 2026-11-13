"use client";
import { useState, useTransition } from "react";
import { postDiscordReminder, postLanToDiscord } from "@/app/actions";
import { btnSecondary } from "./ui";
import { useT } from "@/i18n/client";

type Kind = "signup" | "payment" | "event";

export function DiscordButtons({
  lanId,
  posted,
  channels,
  kinds,
  draft = false,
}: {
  lanId: string;
  posted: number;
  channels: number;
  kinds: { kind: Kind; label: string }[];
  /** Drafts stay off Discord until they're published. */
  draft?: boolean;
}) {
  const t = useT();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button
          className={btnSecondary}
          disabled={draft || pending || !channels}
          onClick={() =>
            start(async () => {
              const n = await postLanToDiscord(lanId);
              setMsg(n ? t("chat.posted", { count: n }) : t("chat.refreshed"));
            })
          }
        >
          {posted < channels ? t("chat.post") : t("chat.refresh")}
        </button>
        {kinds.map((k) => (
          <button
            key={k.kind}
            className={btnSecondary}
            disabled={draft || pending || !channels}
            onClick={() => {
              if (!confirm(t("chat.confirmReminder", { label: k.label, count: channels }))) return;
              start(async () => {
                const n = await postDiscordReminder(lanId, k.kind);
                setMsg(t("chat.postedReminder", { label: k.label, count: n }));
              });
            }}
          >
            {t("chat.postKind", { label: k.label })}
          </button>
        ))}
      </div>
      {draft && <p className="text-sm text-muted">{t("chat.draft")}</p>}
      {msg && <p className="text-sm text-bit">{msg}</p>}
    </div>
  );
}

export function WhatsAppTexts({ texts }: { texts: { kind: string; label: string; text: string }[] }) {
  const t = useT();
  const [active, setActive] = useState(texts[0]?.kind);
  const [copied, setCopied] = useState(false);
  const current = texts.find((x) => x.kind === active) ?? texts[0];
  if (!current) return null;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {texts.map((x) => (
          <button
            key={x.kind}
            onClick={() => {
              setActive(x.kind);
              setCopied(false);
            }}
            className={`rounded-md px-2 py-1 text-xs ${x.kind === current.kind ? "bg-line text-fg" : "text-muted hover:bg-raised"}`}
          >
            {x.label}
          </button>
        ))}
      </div>
      <textarea
        readOnly
        value={current.text}
        rows={Math.min(14, current.text.split("\n").length + 1)}
        className="w-full rounded-md border border-line bg-ink p-3 font-mono text-xs text-fg"
      />
      <div className="flex flex-wrap gap-2">
        <button
          className={btnSecondary}
          onClick={async () => {
            await navigator.clipboard.writeText(current.text);
            setCopied(true);
          }}
        >
          {copied ? `${t("chat.copied")} ✓` : t("chat.copy")}
        </button>
        <a
          className={btnSecondary}
          href={`https://wa.me/?text=${encodeURIComponent(current.text)}`}
          target="_blank"
          rel="noreferrer"
        >
          {t("chat.share")}
        </a>
      </div>
    </div>
  );
}
