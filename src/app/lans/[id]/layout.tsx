/** The event pages, plus a slot for side panels opened from them (a member from the attendee list). */
export default function EventLayout({ children, panel }: LayoutProps<"/lans/[id]">) {
  return (
    <>
      {children}
      {panel}
    </>
  );
}
