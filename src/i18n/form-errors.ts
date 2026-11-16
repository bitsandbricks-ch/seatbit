// Turns zod validation issues into a sentence for people, in their language:
// "Name: please fill this in. Spots: at least 1." instead of zod's English developer text.
import type { z } from "zod";
import type { MessageKey, T } from "./translate";

type FieldKey = Extract<MessageKey, `formErrors.fields.${string}`>;

const asNumber = (v: unknown) => (typeof v === "bigint" ? Number(v) : (v as number));

/** One issue's reason, without the field name. */
function reason(issue: z.core.$ZodIssue, field: string, t: T): string {
  const linkField = /url$/i.test(field);
  switch (issue.code) {
    case "too_small": {
      const min = asNumber(issue.minimum);
      if (issue.origin === "string") return min <= 1 ? t("formErrors.required") : t("formErrors.tooShort", { min });
      if (issue.origin === "array" || issue.origin === "set") return t("formErrors.pickSome");
      return t("formErrors.atLeast", { min });
    }
    case "too_big": {
      const max = asNumber(issue.maximum);
      if (issue.origin === "string") return t("formErrors.tooLong", { max });
      if (issue.origin === "array" || issue.origin === "set") return t("formErrors.tooMany", { max });
      return t("formErrors.atMost", { max });
    }
    case "invalid_type":
      if (issue.expected === "number" || issue.expected === "int") return t("formErrors.number");
      return t("formErrors.invalid");
    case "not_multiple_of":
      return t("formErrors.number");
    default:
      // Links are a union of "" and a URL; dates and prices are refinements.
      if (field === "profileUrl") return t("formErrors.profileLink");
      if (linkField) return t("formErrors.link");
      if (/price|amount/i.test(field)) return t("formErrors.money");
      if (/(At|Date|Deadline)$/.test(field)) return t("formErrors.date");
      return t("formErrors.invalid");
  }
}

/**
 * A readable error for a failed `safeParse`: each bad field once, with its translated label.
 * Fields without a label in `formErrors.fields` show only the reason.
 */
export function formError(error: z.ZodError, t: T): string {
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "");
    if (seen.has(field)) continue;
    seen.add(field);
    const key = `formErrors.fields.${field}` as FieldKey;
    const label = field && t(key) !== key ? t(key) : "";
    const why = reason(issue, field, t);
    parts.push(label ? t("formErrors.line", { field: label, reason: why }) : why.charAt(0).toUpperCase() + why.slice(1));
  }
  return parts.join(" ");
}

