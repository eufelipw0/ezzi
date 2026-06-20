import { brBuilder } from "@magicyan/discord";
import {
  version as djsVersion,
  type Client,
  type CommandInteraction,
  type Message,
  type PermissionResolvable,
} from "discord.js";
import { styleText } from "node:util";
import { type OptionNeed } from "./creators/commands/command.js";
import { type CommandContext } from "./creators/commands/context.js";
import { CommandManager } from "./creators/commands/manager.js";
import type { EventPropData } from "./creators/events/event.js";
import { EventManager } from "./creators/events/manager.js";
import {
  ResponderManager,
  type GenericResponderInteraction,
} from "./creators/responders/manager.js";
import { baseErrorHandler } from "./error.js";
import { version } from "./version.js";

declare const Bun: { version: string };
const isBun = typeof Bun !== "undefined";

export interface BaseCommandsConfig {
  guilds?: string[];
  verbose?: boolean;
  prefix?(message: Message): string[] | Promise<string[]>;
  middleware?(ctx: CommandContext, block: () => void): Promise<void>;
  onNotFound?(interaction: CommandInteraction): void;
  onError?(ctx: CommandContext, error: unknown): void;
  onOptionsError?(message: Message, options: OptionNeed[]): void;
  onMemberPermissionsFailed?(
    ctx: CommandContext,
    missing: PermissionResolvable[],
  ): void;
  onBotPermissionsFailed?(
    ctx: CommandContext,
    missing: PermissionResolvable[],
  ): void;
}
("");
export interface BaseRespondersConfig {
  middleware?(
    interaction: GenericResponderInteraction,
    block: () => void,
    params: object,
  ): Promise<void>;
  onNotFound?(interaction: GenericResponderInteraction): void;
  onError?(
    error: unknown,
    interaction: GenericResponderInteraction,
    params: object,
  ): void;
}

export interface BaseEventsConfig {
  middleware?(
    event: EventPropData,
    block: (...tags: string[]) => void,
  ): Promise<void>;
  onError?(error: unknown, event: EventPropData): void;
}

export type BaseErrorHandler = (error: Error | unknown, client: Client) => void;

export interface BaseConfig {
  commands: BaseCommandsConfig;
  events: BaseEventsConfig;
  responders: BaseRespondersConfig;
  errorHandler: BaseErrorHandler;
}

export class EzziApp {
  public readonly commands: CommandManager;
  public readonly responders: ResponderManager;
  public readonly events: EventManager;
  public readonly config: BaseConfig;

  private static "~instance": EzziApp | null = null;

  private constructor() {
    this.events = new EventManager(this);
    this.commands = new CommandManager(this);
    this.responders = new ResponderManager(this);

    this.config = {
      commands: {},
      responders: {},
      events: {},
      errorHandler: baseErrorHandler,
    };
  }

  public static getInstance(): EzziApp {
    return (this["~instance"] ??= new EzziApp());
  }

  public static destroy(): void {
    this["~instance"] = null;
  }

  public setErrorHandler(handler: BaseErrorHandler): void {
    this.config.errorHandler = handler;
  }

  public intro(): void {
    console.log();
    console.log(
      "%s %s",
      styleText("blue", "★ Ezzi Base"),
      styleText("dim", version),
    );
    console.log(
      "%s %s | %s %s",
      styleText("blueBright", "◌ discord.js"),
      styleText("dim", djsVersion),
      isBun ? "◌ Bun" : styleText("green", "⬢ Node.js"),
      styleText("dim", isBun ? Bun.version : process.versions.node),
    );
    console.log();
  }

  public printLogs(): void {
    console.log(
      brBuilder(
        ...this.commands.logs,
        ...this.responders.logs,
        ...this.events.logs,
      ),
    );
  }
}
