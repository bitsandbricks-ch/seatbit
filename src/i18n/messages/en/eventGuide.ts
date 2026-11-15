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
  /** Short names for the sections inside the Trip tab, so all five fit on a phone. */
  sections: { travel: "Travel", gear: "Packing", games: "Games", food: "Food", costs: "Costs" },
  trip: "Trip",
  tripLabel: "Trip sections",
};
