import {
  Client,
  type ClientOptions,
} from "discord.js";
import { styleText } from "node:util";
import { LithiumApp } from "./app.js";
import { CustomItents, CustomPartials } from "@magicyan/discord";

export type CustomClientOptions = Partial<ClientOptions>;

/**
 * Creates and configures a Discord.js client instance integrated with LithiumApp.
 *
 * This function initializes a `Client`, assigns the provided bot token, binds
 * lifecycle events, and automatically wires command handlers, autocomplete
 * handlers, prefix messages, and general interaction responders from the Lithium framework.
 *
 * The client will log a formatted startup message once it becomes ready.
 */
export function createClient(token: string, options: CustomClientOptions) {
  const app = LithiumApp.getInstance();

  const client = new Client({
      ...options,
      intents: options.intents ?? CustomItents.All,
      partials: options.partials ?? CustomPartials.All,
      failIfNotExists: options.failIfNotExists ?? false,
  });
  
  client.token = token;

  client.once("clientReady", async (readyClient) => {
    console.log(
      "%s %s %s",
      styleText("green", "●"),
      styleText(["greenBright", "underline"], readyClient.user.username),
      styleText("green", "application is ready!"),
    );
    await app.commands.register(readyClient);
    
    if (typeof app.events.runReady === "function") {
      await (app.events as any).runReady(readyClient);
    }
  });

  client.on("messageCreate", async (message) => {
      if (message.author.bot) return;
      await app.commands.onPrefixCommand(message);
  });

  client.on("interactionCreate", async (interaction) => {
    if (interaction.isAutocomplete()) {
      await app.commands.onAutocomplete(interaction);
      return;
    }
    if (interaction.isCommand()) {
      await app.commands.onCommand(interaction);
      return;
    }
    await app.responders.onResponder(interaction);
  });

  return client;
}