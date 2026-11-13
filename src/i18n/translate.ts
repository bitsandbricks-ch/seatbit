// Tiny translation helper shared by server and client: t("home.title", { name }).
// Messages are plain strings with {placeholders}; a message with count variants is
// { one, other } and picks by vars.count. No ICU, on purpose: two languages don't need it.
import type { ReactNode } from "react";
import { Fragment, createElement } from "react";
import type { Locale } from "./config";
import { en, type Messages } from "./messages/en";
import { de } from "./messages/de";

export const MESSAGES: Record<Locale, Messages> = { en, de };

type Plural = { one: string; other: string };
type Leaves<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string | Plural ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];

export type MessageKey = Leaves<Messages>;
export type Vars = Record<string, string | number | null | undefined>;

function lookup(messages: unknown, key: string): string | Plural | undefined {
  let cur: unknown = messages;
  for (const part of key.split(".")) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur as string | Plural | undefined;
}

function pick(msg: string | Plural | undefined, vars?: Vars): string | undefined {
  if (msg == null || typeof msg === "string") return msg;
  return vars?.count === 1 ? msg.one : msg.other;
}

const fill = (s: string, vars?: Vars) => (vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k] ?? "") : m)) : s);

export interface T {
  (key: MessageKey, vars?: Vars): string;
  /** Like t(), but placeholders may be React nodes (links, bold names). */
  rich: (key: MessageKey, vars: Record<string, ReactNode>) => ReactNode;
  locale: Locale;
}

export function makeT(locale: Locale): T {
  const own = MESSAGES[locale];
  const raw = (key: MessageKey, vars?: Vars) => pick(lookup(own, key), vars) ?? pick(lookup(en, key), vars) ?? key;
  const t = ((key: MessageKey, vars?: Vars) => fill(raw(key, vars), vars)) as T;
  t.rich = (key, vars) => {
    const count = typeof vars.count === "number" ? vars.count : undefined;
    const parts = raw(key, { count }).split(/(\{\w+\})/);
    return createElement(
      Fragment,
      null,
      ...parts.map((p, i) => {
        const m = /^\{(\w+)\}$/.exec(p);
        return createElement(Fragment, { key: i }, m && m[1] in vars ? vars[m[1]] : p);
      }),
    );
  };
  t.locale = locale;
  return t;
}
