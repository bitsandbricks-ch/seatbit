// The event page's guide: where each open step leads, the extras for this event, and the Trip tab.
export const eventGuide = {
  next: "Next",
  go: {
    nick: "Set your nick",
    wishes: "Send seat wishes",
    pick: "Pick a seat",
    games: "Open games",
  },
  also: "Also for this event",
  extras: {
    rides: { one: "{count} needs a ride", other: "{count} need a ride" },
    pack: "Pack your bag",
    games: { one: "{count} game to install", other: "{count} games to install" },
    food: { one: "Food order open", other: "{count} food orders open" },
    owe: "You owe {amount}",
    back: "You get {amount} back",
  },
  /** Short names for the sections inside the Trip tab, so all four fit on a phone. */
  sections: { travel: "Travel", gear: "Packing", games: "Games", costs: "Costs" },
  trip: "Trip",
  /** The tab with food orders, there only while the event runs (leads: always). */
  onSite: "On site",
  onSiteLater: "Food orders show up here once the event starts.",
  onSiteLeads: "Only leads see this tab before the event. Members get it once the event starts, so you can set up a food order in advance.",
  tripLabel: "Trip sections",
};
