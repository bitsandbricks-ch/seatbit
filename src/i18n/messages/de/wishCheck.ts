import type { Messages } from "../en";

export const wishCheck: Messages["wishCheck"] = {
  near: { next: "direkt neben {name}", two: "nahe bei {name}", three: "max. 3 Plätze von {name}", row: "gleiche Reihe wie {name}" },
  avoid: { next: "nicht direkt neben {name}", two: "nicht in 2 Plätzen von {name}", three: "nicht in 3 Plätzen von {name}", row: "nicht in der Reihe von {name}" },
  edge: "am Rand",
  middle: "in der Mitte",
  row: "Reihe {row}",
  seat: "Platz {seat}",
};
