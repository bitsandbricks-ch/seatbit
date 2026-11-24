import { currentMaintenance, maintenanceTitle } from "@/lib/maintenance";
import { getT } from "@/i18n/server";
import { pageWidth } from "./ui";

/** Strip under the header on every page while maintenance is planned or going on. */
export async function MaintenanceBanner() {
  const m = currentMaintenance();
  if (!m) return null;
  const t = await getT();
  const when = maintenanceTitle(m, t);
  return (
    <div
      role="status"
      className={`border-b py-2 text-sm ${m.state === "now" ? "border-warn/40 bg-warn/15 text-warn" : "border-line bg-raised text-fg/90"}`}
    >
      <p className={pageWidth}>
        <span className="font-semibold">{when}</span> {m.message}
      </p>
    </div>
  );
}
