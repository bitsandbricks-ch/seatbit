import type { MetadataRoute } from "next";
import { getT } from "@/i18n/server";
import { THEME_COLORS } from "@/lib/theme";

/**
 * Web app manifest: "Add to home screen" opens Seatbit like an app (own icon, no browser bar).
 * Dark like the brand; the page's own theme colour (layout.tsx) takes over once it runs.
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const t = await getT();
  return {
    name: "Seatbit",
    short_name: "Seatbit",
    description: t("share.tagline"),
    lang: t.locale,
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: THEME_COLORS.dark,
    theme_color: THEME_COLORS.dark,
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
