import type { GameView } from "./games";

/**
 * What I still have to install: only the games I voted for myself and haven't ticked yet.
 * Others' votes don't put a game on my list. Pure, so client components can use it.
 */
export function myGamesTodo(games: Pick<GameView, "myVote" | "myInstalled" | "sizeGb">[]) {
  const voted = games.filter((g) => g.myVote);
  const open = voted.filter((g) => !g.myInstalled);
  return { voted: voted.length, toInstall: open.length, gb: open.reduce((n, g) => n + (g.sizeGb ?? 0), 0) };
}
