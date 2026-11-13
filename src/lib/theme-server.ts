import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { THEME_COOKIE, isTheme, type Theme } from "./theme";

/** This browser's theme choice; "system" until someone picks one. */
export const getTheme = cache(async (): Promise<Theme> => {
  const v = (await cookies()).get(THEME_COOKIE)?.value;
  return isTheme(v) ? v : "system";
});
