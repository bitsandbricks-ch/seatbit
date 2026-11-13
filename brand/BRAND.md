# Seatbit brand guide

Seatbit keeps a LAN party's seats, nicks and attendance in one place. The brand
should feel like the room itself: a dark hall, a grid of desks, and one green
light that says "this one's yours".

## Name

- Always written **Seatbit** in text (capital S, one word). Never "SeatBit" or "Seat Bit".
- The wordmark is set in lowercase: **seat** in the foreground colour, **bit** in Bit Green.
- Short tagline: *Seats, nicks and attendance for your LAN party.*
- One-liner: *Who's coming, who's paid, who sits where.*

## Logo

The mark is a 3×3 seat grid. The lit cells draw a pixel chair seen from the side
(backrest on the left, seat across the middle, two legs), so it is literally a
**seat made of bits**. The three unlit cells are empty seats.

| File | Use |
| --- | --- |
| `logo/seatbit-logo.svg` | Horizontal lockup on dark backgrounds (default) |
| `logo/seatbit-logo-light.svg` | Horizontal lockup on light backgrounds |
| `logo/seatbit-mark.svg` / `-light.svg` | Mark alone (avatars, header on mobile) |
| `logo/seatbit-mark-mono.svg` | One colour, uses `currentColor` (no empty seats) |
| `logo/seatbit-wordmark*.svg` | Wordmark alone |
| `logo/seatbit-icon.svg`, `png/icon-*.png` | App icon on an ink tile (PWA, Discord bot, social avatar) |
| `logo/favicon.svg` | Favicon (empty seats dropped for 16 px legibility) |
| `logo/og-image.svg`, `png/og-image.png` | 1200×630 link preview |

Rules:

- Clear space around the logo is at least one cell width on every side.
- Minimum size: mark 16 px, lockup 96 px wide.
- Don't recolour individual cells, rotate the mark, add shadows or outlines, or
  set the wordmark in another font. Use the mono variant when you only have one colour.
- The wordmark is outlined Geist Bold (tracking −2.5%), so it needs no font.

## Colour

Dark-first. Bit Green is the only brand accent and it always means "you / yours / go".

| Token | Hex | Role |
| --- | --- | --- |
| `ink` | `#0B0B0F` | Page background |
| `surface` | `#16161D` | Cards and panels |
| `raised` | `#1F1F28` | Inputs, hover, free seats |
| `line` | `#2A2A35` | Borders |
| `fg` | `#F4F4F5` | Main text |
| `muted` | `#A1A1AA` | Secondary text |
| `faint` | `#71717A` | Hints, footer |
| `bit` | `#2EE59D` | **Bit Green**: your seat, primary buttons, "going" |
| `bit-deep` | `#0E9F6E` | Bit Green on light backgrounds (logo, large type) |
| `bit-ink` | `#047857` | Green body text on light backgrounds |
| `on-bit` | `#0B0B0F` | Text and icons on a Bit Green fill |
| `seat-taken` | `#38BDF8` | Someone else's seat |
| `warn` | `#FBBF24` | Due soon, maybe |
| `danger` | `#F87171` | Overdue, unpaid, can't make it |

Text on a Bit Green button is `on-bit` (ink), not white. Bit Green on ink is 12:1 and muted on surface is 7:1, both well above WCAG AA.
`faint` is 4.1:1, so keep it to non-essential hints; `bit-deep` on white is 3.2:1, so use
it only for the logo and large type and use `bit-ink` (5.3:1) for green text on light.

### Light theme

The app also has a light theme (people pick *Light*, *Dark* or *System* in the top bar). Dark stays the
brand's home; light is the same tokens with daylight values, set in `brand/tokens.css`:

| Token | Light | Note |
| --- | --- | --- |
| `ink` | `#F5F5F7` | Page background |
| `surface` | `#FFFFFF` | Cards and panels |
| `raised` | `#EEEEF2` | Inputs, hover, free seats |
| `line` | `#DCDCE3` | Borders |
| `fg` | `#111118` | 18.8:1 on surface |
| `muted` | `#52525B` | 7.7:1 on surface |
| `faint` | `#6B6B75` | 5.3:1 on surface |
| `bit` | `#047857` | `bit-ink`, so green text stays AA (5.5:1) |
| `on-bit` | `#FFFFFF` | White on green fills (5.5:1) |
| `seat-taken` | `#0369A1` | 5.9:1 |
| `warn` | `#B45309` | 5.0:1 |
| `danger` | `#C81E1E` | 5.7:1 |

The light theme uses `seatbit-logo-light.svg` and `seatbit-mark-light.svg`.

## Typography

- **Geist** (sans) for everything in the UI. Headings Bold/SemiBold with slight negative tracking, body Regular.
- **Geist Mono** for seat labels (A1, B5), nicks in seat cells, prices and codes.
- Both are free (SIL OFL) and already loaded in `src/app/layout.tsx` via `next/font/google`.

## Shape and texture

- Small radius on bits (`radius-bit`, 6 px), larger on cards (`radius-card`, 14 px). Cells of the
  mark use 22% of their width as radius; keep UI chips in the same spirit.
- The repeated seat-grid pattern (see the OG image) is the brand's background texture. Keep it very
  low contrast (`#14141B` on ink).

## Voice

Friendly, short, a bit nerdy, never cringe. Talk like the orga in the group chat.

- "You're in. Seat B5 is yours." rather than "Your registration was successful."
- "Payment due Friday" rather than "Please remit payment by the due date."
- English by default; Swiss German slang is fine in event descriptions, not in UI copy.

## Code

- Source of truth for all of this is the repo `bitsandbricks-ch/seatbit`, folder `brand/`.

- `brand/tokens.css` is a Tailwind 4 `@theme` block with every token above. Import it from `globals.css`.
- `src/app/icon.svg`, `favicon.ico`, `apple-icon.png` and `opengraph-image.png` are picked up by Next.js automatically.
- `public/brand/` holds the files the app references at runtime (for example the header logo).
- `brand/generate.py` regenerates all SVGs (needs `fonttools` and the Geist TTFs from the `geist` npm package).
