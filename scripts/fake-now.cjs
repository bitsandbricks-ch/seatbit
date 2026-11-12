/**
 * Preload for reproducible screenshots: when SEATBIT_FAKE_NOW is set (an ISO
 * date), the process clock starts at that moment and keeps ticking from there.
 * Used by scripts/screenshots.ts for the seed and the server, so relative dates
 * ("in 30 days") and the images stay the same on every run.
 *
 *   NODE_OPTIONS="--require ./scripts/fake-now.cjs" SEATBIT_FAKE_NOW=2026-11-12T10:00:00+01:00 ...
 */
const fixed = Date.parse(process.env.SEATBIT_FAKE_NOW ?? "");
if (!Number.isNaN(fixed)) {
  const RealDate = Date;
  const offset = fixed - RealDate.now();
  const now = () => RealDate.now() + offset;
  // A plain function (not a subclass) that shares Date's prototype, with every static copied over.
  function FakeDate(...args) {
    if (!new.target) return new RealDate(now()).toString();
    return Reflect.construct(RealDate, args.length ? args : [now()], new.target);
  }
  FakeDate.prototype = RealDate.prototype;
  FakeDate.parse = RealDate.parse;
  FakeDate.UTC = RealDate.UTC;
  FakeDate.now = now;
  globalThis.Date = FakeDate;
}
