import fs from "node:fs";
import path from "node:path";
import { ImageResponse } from "next/og";
import { getLan } from "@/lib/lans";
import { getClan, uploadsDir } from "@/lib/clans";
import { lanRange } from "@/lib/format";
import { instanceLocale, makeT } from "@/i18n/server";

// Crawlers send no language, so the card uses the instance's default language.
export function generateImageMetadata() {
  return [{ id: "card", alt: makeT(instanceLocale())("share.imageAlt"), size, contentType }];
}
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Images can't read the CSS tokens, so the brand colours (brand/tokens.css) are repeated here.
const INK = "#0b0b0f";
const SURFACE = "#16161d";
const LINE = "#2a2a35";
const FG = "#f4f4f5";
const MUTED = "#a1a1aa";
const BIT = "#2ee59d";
const DANGER = "#f87171";

const mark = `data:image/svg+xml;base64,${fs
  .readFileSync(path.join(process.cwd(), "public/brand/seatbit-mark.svg"))
  .toString("base64")}`;

// The image renderer reads PNG, JPEG and GIF, not WebP: those clans get their initials.
const RENDERABLE: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif" };

function clanAvatar(file: string | null) {
  if (!file || file.includes("/") || file.includes("..")) return null;
  const mime = RENDERABLE[path.extname(file).slice(1).toLowerCase()];
  const full = path.join(uploadsDir, file);
  if (!mime || !fs.existsSync(full)) return null;
  return `data:${mime};base64,${fs.readFileSync(full).toString("base64")}`;
}

/** The link preview card for a shared event: event name, date, place and the clan's avatar. Drafts get a plain Seatbit card. */
export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const t = makeT(instanceLocale());
  const l = getLan((await params).id);
  const shown = l?.publishedAt ? l : undefined;
  const clan = shown?.clanId ? getClan(shown.clanId) : undefined;
  const avatar = clanAvatar(clan?.avatar ?? null);
  const initials = (clan?.name ?? "")
    .split(/\s+/)
    .filter((w) => !/^(the|der|die|das)$/i.test(w))
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  const title = shown?.name ?? "Seatbit";
  const titleSize = title.length > 40 ? 64 : title.length > 24 ? 76 : 88;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: INK, padding: 64, color: FG }}>
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          {clan &&
            (avatar ? (
              <img src={avatar} width={96} height={96} style={{ borderRadius: 16, objectFit: "cover" }} alt="" />
            ) : (
              <div
                style={{
                  width: 96,
                  height: 96,
                  borderRadius: 16,
                  background: SURFACE,
                  border: `2px solid ${LINE}`,
                  color: BIT,
                  fontSize: 40,
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {initials}
              </div>
            ))}
          {clan && <div style={{ fontSize: 36, color: MUTED, display: "flex" }}>{clan.name}</div>}
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 20 }}>
          {shown?.cancelledAt && <div style={{ fontSize: 36, color: DANGER, fontWeight: 700 }}>{t("share.cancelled")}</div>}
          <div style={{ fontSize: titleSize, fontWeight: 700, lineHeight: 1.05, letterSpacing: -2, display: "flex" }}>{title}</div>
          {shown ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 40, color: MUTED }}>
              <div style={{ color: BIT, display: "flex" }}>{lanRange(shown, t.locale)}</div>
              {shown.location && <div style={{ display: "flex" }}>{shown.location}</div>}
            </div>
          ) : (
            <div style={{ fontSize: 40, color: MUTED, display: "flex" }}>{t("share.tagline")}</div>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 32, color: MUTED }}>
          <img src={mark} width={44} height={44} alt="" />
          <span style={{ color: FG, fontWeight: 700 }}>Seatbit</span>
        </div>
      </div>
    ),
    size,
  );
}
