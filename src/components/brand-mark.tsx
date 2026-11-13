/* eslint-disable @next/next/no-img-element */

/** The pixel-chair mark, in the variant for the current theme (light uses deeper green and pale cells). */
export function BrandMark({ className }: { className: string }) {
  return (
    <>
      <img src="/brand/seatbit-mark.svg" alt="" className={`${className} light:hidden`} />
      <img src="/brand/seatbit-mark-light.svg" alt="" className={`${className} hidden light:block`} />
    </>
  );
}
