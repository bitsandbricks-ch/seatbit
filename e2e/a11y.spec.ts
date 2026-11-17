import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { ADMIN_PAGES, LEAD_PAGES, MEMBER_PAGES } from "./pages";

// Accessibility check with axe on every demo page, in the dark and the light theme: colour contrast,
// links that only differ by colour, heading order, landmarks, names. The smoke test already checks
// names on its own; this one catches what needs computed styles, mostly contrast after a token change.
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"];

async function audit(page: Page, urls: string[]) {
  const found: string[] = [];
  for (const url of urls) {
    await page.goto(url);
    await expect(page.getByRole("main").first(), url).toBeVisible();
    // The page itself, not the loading skeleton (src/app/loading.tsx) that streams first.
    await expect(page.locator("main [aria-busy=true]"), url).toHaveCount(0);
    const { violations } = await new AxeBuilder({ page })
      // Runs in the page itself: the default opens a helper page per check, which is slow over ~60 pages.
      .setLegacyMode(true)
      .withTags(TAGS)
      // Rows dimmed on purpose (past or cancelled events, locked to-dos): inactive items, which WCAG
      // leaves out of the contrast rule.
      .exclude(".opacity-60, .opacity-70")
      .analyze();
    for (const v of violations) {
      for (const n of v.nodes.slice(0, 3)) found.push(`${url}: ${v.id} (${v.help}) at ${n.target.join(" ")}: ${n.failureSummary?.split("\n")[1]?.trim() ?? ""}`);
    }
  }
  expect(found).toEqual([]);
}

for (const colorScheme of ["dark", "light"] as const) {
  test.describe(`accessibility, ${colorScheme} theme`, () => {
    // "System" is the default theme, so the browser's setting picks it.
    test.use({ colorScheme });
    // Many pages each; axe takes a moment per page.
    test.describe.configure({ timeout: 180_000 });

    test("member pages", async ({ as }) => {
      await audit(await as("anna"), MEMBER_PAGES);
    });

    test("lead pages", async ({ as }) => {
      await audit(await as("alex"), LEAD_PAGES);
    });

    test("admin pages", async ({ as }) => {
      await audit(await as("alex"), ADMIN_PAGES);
    });
  });
}

test("keyboard users can skip the top bar", async ({ as }) => {
  const page = await as("anna");
  await page.goto("/");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to content" });
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator("main#main")).toBeFocused();
});
