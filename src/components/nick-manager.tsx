import { addNick, deleteNick, setPrimaryNick } from "@/app/actions";
import type { Nickname } from "@/db/schema";
import { btnGhost, btnSecondary, input } from "./ui";

/** Manage nicks for one scope: default (no ids), a LAN type, or a single event. */
export function NickManager({
  nicks,
  lanId = null,
  typeId = null,
}: {
  nicks: Nickname[];
  lanId?: string | null;
  typeId?: string | null;
}) {
  const scoped = nicks.filter((n) => n.lanId === lanId && n.typeId === typeId);
  return (
    <div className="space-y-3">
      {scoped.length > 0 && (
        <ul className="space-y-1">
          {scoped.map((n) => (
            <li key={n.id} className="flex items-center justify-between rounded-md bg-zinc-800/60 px-3 py-1.5">
              <span className="font-medium">
                {n.nick}
                {n.isPrimary && <span className="ml-2 text-xs text-bit">primary</span>}
              </span>
              <span className="flex gap-1">
                {!n.isPrimary && (
                  <form action={setPrimaryNick.bind(null, n.id)}>
                    <button className={`${btnGhost} !px-2 !py-0.5 text-xs`}>Make primary</button>
                  </form>
                )}
                <form action={deleteNick.bind(null, n.id)}>
                  <button className={`${btnGhost} !px-2 !py-0.5 text-xs text-red-300`}>Remove</button>
                </form>
              </span>
            </li>
          ))}
        </ul>
      )}
      <form action={addNick} className="flex gap-2">
        {lanId && <input type="hidden" name="lanId" value={lanId} />}
        {typeId && <input type="hidden" name="typeId" value={typeId} />}
        <input name="nick" required maxLength={32} placeholder="Add a nick" className={input} />
        <button className={btnSecondary}>Add</button>
      </form>
    </div>
  );
}
