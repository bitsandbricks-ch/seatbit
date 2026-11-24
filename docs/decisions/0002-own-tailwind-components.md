# 0002 Own Tailwind components, no UI library

**Context:** Seatbit's UI is built from its own Tailwind components (`src/components/ui.tsx`, `section-nav.tsx`, `client-tabs.tsx`, `dialog.tsx`, ...) on the brand tokens in `brand/tokens.css`. shadcn/ui and Mantine were considered.

**Decision:** no UI library. Keep the own components; copy a single shadcn/ui part only for a widget that is hard to get right (keyboard, focus, positioning).

**Consequences:** Seatbit doesn't use `@bitsandbricks/ui`, which is Mantine based ([handbook decision 0001](https://github.com/bitsandbricks-ch/handbook/blob/main/decisions/0001-stack-standard.md)); it shares the tokens once they exist. New UI reuses the existing components first.
