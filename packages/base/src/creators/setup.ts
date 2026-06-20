import {
  ApplicationCommandOptionType,
  ApplicationCommandType,
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
  type AppCommandData,
  type CommandType,
  type SubCommandGroupModuleData,
  type SubCommandModuleData,
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

/**
 * Initializes the Ezzi command/event/responder creation system.
 *
 * This function configures the Ezzi application’s internal registries
 * for commands, events, and responders, and returns a set of factory
 * functions used to create each type of component.
 */
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
      P extends boolean = false,
      R = void,
    >(data: AppCommandData<T, P, R>): any {
      const currentApp = EzziApp.getInstance();

      if (defaultMemberPerms) {
        (data as any).defaultMemberPermissions ??= defaultMemberPerms;
      }

      if (defaultBotPerms && !(data as any).botPermissions?.length) {
        (data as any).botPermissions = defaultBotPerms;
      }

      const resolved = currentApp.commands.set(data as any);

      if (typeof (currentApp.commands as any).addLog === "function") {
        (currentApp.commands as any).addLog(resolved);
      }

      if (resolved.type !== ApplicationCommandType.ChatInput) {
        return resolved;
      }

      const commandName = resolved.name;

      const createSubcommand =
        <SubResult>(group?: string) =>
        (subData: SubCommandModuleData<P, SubResult>): void => {
          const subApp = EzziApp.getInstance();
          if (defaultBotPerms && !subData.botPermissions?.length) {
            subData = { ...subData, botPermissions: defaultBotPerms };
          }
          subApp.commands.addModule(commandName, {
            ...subData,
            group,
            type: ApplicationCommandOptionType.Subcommand,
          });
        };

      return Object.assign(data as any, {
        ...resolved,

        group<W = R>(groupData: SubCommandGroupModuleData<P, R, W>) {
          const groupApp = EzziApp.getInstance();
          if (defaultBotPerms && !groupData.botPermissions?.length) {
            groupData = { ...groupData, botPermissions: defaultBotPerms };
          }
          groupApp.commands.addModule(commandName, {
            ...groupData,
            type: ApplicationCommandOptionType.SubcommandGroup,
          });
          return { subcommand: createSubcommand<W>(groupData.name) };
        },

        subcommand: createSubcommand<R>(),
      });
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
