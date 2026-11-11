/**
 * Registers the bot's slash commands with Discord. Run once after setup and
 * whenever the commands change:  npm run discord:register
 */
import { commands, inviteUrl, registerCommands } from "../src/lib/discord-api";

registerCommands()
  .then(() => {
    console.log(`Registered ${commands.length} commands: ${commands.map((c) => "/" + c.name).join(", ")}`);
    console.log(`Invite the bot to a server: ${inviteUrl()}`);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
