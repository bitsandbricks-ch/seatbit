"use client";
import { useEffect, useState } from "react";
import { useToastAction } from "./action-form";
import { deleteLeadContact, saveLeadContact } from "@/app/lead-task-actions";
import type { FormState } from "@/app/actions";
import type { LeadContact } from "@/db/schema";
import { useT } from "@/i18n/client";
import { ContactDetails } from "./lead-contacts";
import { Field, Input, btnGhost, btnPrimary, btnSecondary, input } from "./ui";
import { ActionForm } from "@/components/action-form";

type Contact = Omit<LeadContact, "createdAt" | "typeId">;

/** Organizer contacts of one LAN type: list with edit and delete, plus a form to add one. */
export function LeadContactEditor({ typeId, contacts }: { typeId: string; contacts: Contact[] }) {
  const t = useT();
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(0);
  return (
    <div className="space-y-3">
      {contacts.length === 0 ? (
        <p className="text-sm text-muted">{t("contacts.none")}</p>
      ) : (
        <ul className="divide-y divide-line">
          {contacts.map((c) =>
            editing === c.id ? (
              <li key={c.id} className="py-3">
                <ContactForm typeId={typeId} contact={c} onDone={() => setEditing(null)} />
              </li>
            ) : (
              <li key={c.id} className="flex flex-wrap items-start justify-between gap-2 py-2.5">
                <ContactDetails c={c} t={t} />
                <span className="flex gap-1">
                  <button type="button" className={btnGhost} onClick={() => setEditing(c.id)}>
                    {t("contacts.edit")}
                  </button>
                  <ActionForm action={deleteLeadContact.bind(null, c.id)} done="deleted">
                    <button className={`${btnGhost} text-danger`}>{t("contacts.delete")}</button>
                  </ActionForm>
                </span>
              </li>
            ),
          )}
        </ul>
      )}
      <details className="rounded-card border border-line p-3" key={adding}>
        <summary className="cursor-pointer text-sm font-medium text-bit">{t("contacts.add")}</summary>
        <div className="mt-3">
          <ContactForm typeId={typeId} onDone={() => setAdding((n) => n + 1)} />
        </div>
      </details>
    </div>
  );
}

function ContactForm({ typeId, contact: c, onDone }: { typeId: string; contact?: Contact; onDone: () => void }) {
  const t = useT();
  const [state, action, pending] = useToastAction<FormState>(saveLeadContact, undefined);
  useEffect(() => {
    if (state?.ok) onDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  return (
    <form action={action} className="space-y-4">
      {c ? <input type="hidden" name="id" value={c.id} /> : <input type="hidden" name="typeId" value={typeId} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("contacts.name")}>
          <Input name="name" defaultValue={c?.name} required maxLength={200} />
        </Field>
        <Field label={t("contacts.role")}>
          <Input name="role" defaultValue={c?.role} maxLength={200} placeholder={t("contacts.rolePlaceholder")} />
        </Field>
        <Field label={t("contacts.email")}>
          {/* i18n-ignore: example address */}
          <Input type="email" name="email" defaultValue={c?.email} placeholder="orga@example.com" />
        </Field>
        <Field label={t("contacts.discord")}>
          <Input name="discord" defaultValue={c?.discord} placeholder={t("contacts.discordPlaceholder")} />
        </Field>
        <Field label={t("contacts.phone")}>
          <Input type="tel" name="phone" defaultValue={c?.phone} placeholder="+41 79 123 45 67" />
        </Field>
        <Field label={t("contacts.website")}>
          <Input name="url" defaultValue={c?.url} placeholder="https://example.com" />
        </Field>
      </div>
      <Field label={t("contacts.note")}>
        <textarea name="note" defaultValue={c?.note} rows={2} maxLength={1000} className={input} />
      </Field>
      <div className="flex gap-2">
        <button disabled={pending} className={btnPrimary}>
          {c ? t("contacts.save") : t("contacts.add")}
        </button>
        {c && (
          <button type="button" className={btnSecondary} onClick={onDone}>
            {t("leadTasks.form.cancel")}
          </button>
        )}
      </div>
    </form>
  );
}
