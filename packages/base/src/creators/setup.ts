import {
  ApplicationCommandType,
  InteractionContextType,
  type CacheType,
  type ClientEvents,
  type PermissionResolvable,
} from "discord.js";
import {
  type BaseCommandsConfig,
  type BaseEventsConfig,
  type BaseRespondersConfig,
  EzziApp,
} from "../app.js";
import {
  Command,
  type AppCommandData,
  type CommandType,
} from "./commands/command.js";
import { Event, type EventData } from "./events/event.js";
import {
  Responder,
  type ResponderData,
  type ResponderType,
} from "./responders/responder.js";

export interface SetupCreatorsOptions {
  commands?: Partial<BaseCommandsConfig> & {
    defaultMemberPermissions?: PermissionResolvable[];
    defaultBotPermissions?: PermissionResolvable[];
  };
  responders?: Partial<BaseRespondersConfig>;
  events?: Partial<BaseEventsConfig>;
}

export function setupCreators(options: SetupCreatorsOptions = {}) {
  const app = EzziApp.getInstance();

  app.config.commands = { ...(options.commands ?? {}) };
  app.config.commands.guilds ??= [];
  app.config.responders = { ...(options.responders ?? {}) };
  app.config.events = { ...(options.events ?? {}) };

  if (process.env.GUILD_ID?.length) {
    app.config.commands.guilds.push(process.env.GUILD_ID);
  }

  const defaultMemberPerms = options.commands?.defaultMemberPermissions;
  const defaultBotPerms = options.commands?.defaultBotPermissions;

  return {
    createCommand<
      T extends CommandType = ApplicationCommandType.ChatInput,
      const C extends readonly InteractionContextType[] = [InteractionContextType.Guild],
      R = void,
    >(data: AppCommandData<T, C, R>): Command<T, C, R> {
      const currentApp = EzziApp.getInstance();

      if (defaultMemberPerms) data.defaultMemberPermissions ??= defaultMemberPerms;
      if (defaultBotPerms && !data.botPermissions?.length) data.botPermissions = defaultBotPerms;

      const command = new Command<T, C, R>(data);

      const resolved = currentApp.commands.set(command.data as any);

      command.moduleListener = (module) => {
        currentApp.commands.addModule(resolved.name, module);
      };

      if (typeof (currentApp.commands as any).addLog === "function") {
        (currentApp.commands as any).addLog(resolved);
      }

      return command;
    },

    createEvent<EventName extends keyof ClientEvents>(
      data: EventData<EventName>,
    ) {
      const currentApp = EzziApp.getInstance();

      const resolved = new Event({
        ...data,
        once:
          data.event === "ready" || data.event === "clientReady"
            ? true
            : data.once,
      });

      return currentApp.events.add(resolved as any);
    },
    createResponder<
      Path extends string,
      const Types extends readonly ResponderType[],
      Schema,
      Cache extends CacheType = CacheType,
    >(data: ResponderData<Path, Types, Schema, Cache>) {
      const currentApp = EzziApp.getInstance();

      const responderInstance = new Responder(data as any);

      currentApp.responders.set(responderInstance as any);

      return responderInstance;
    },
  };
}