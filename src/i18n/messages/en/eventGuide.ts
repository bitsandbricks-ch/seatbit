// The event page's guide: where each open step leads, the extras for this event, and the hub rows.
export const eventGuide = {
  next: "Next",
  go: {
    nick: "Set your nick",
    wishes: "Send seat wishes",
    pick: "Pick a seat",
    games: "Open games",
  },
  /** Status lines shared by the section rows. */
  extras: {
    games: { one: "{count} game to install", other: "{count} games to install" },
    owe: "You owe {amount}",
    back: "You get {amount} back",
  },
  glance: "At a glance",
  trip: "Trip",
  tripLabel: "Trip sections",
  /** Short names inside the Trip tab's switch, so all four fit on a phone. */
  sections: { travel: "Travel", gear: "Packing", games: "Games", costs: "Costs" },
  sectionsLabel: "Sections",
  /** The hub's rows: one line each on why you'd open the section. */
  rows: {
    overview: "News, details and your nick",
    seatsNone: "No seats yet",
    seatsPick: "Pick your seat",
    seatPicked: "You picked {seat}",
    seatFinal: "Your seat: {seat}",
    planOpen: "Seat plan not final yet",
    planFinal: "Seat plan is final",
    coming: "{count} coming",
    comingWaiting: "{count} coming · {waiting} waiting",
    interested: "{count} would come",
    travel: "{free} free seats in cars · {looking} looking",
    travelNone: "No rides or places to sleep yet",
    packed: "{done} of {total} packed",
    games: { one: "{count} game", other: "{count} games" },
    gamesNone: "No games yet",
    costsEven: "You're even",
    costsNone: "No shared costs yet",
    foodOpen: { one: "Food order open", other: "{count} food orders open" },
    foodNone: "No open food orders",
  },
  /** The section with food orders, there only while the event runs (leads: always). */
  onSite: "On site",
  onSiteLater: "Food orders show up here once the event starts.",
  onSiteLeads: "Only leads see this tab before the event. Members get it once the event starts, so you can set up a food order in advance.",
};
