import { isDefined, limitText, spaceBuilder } from "@magicyan/discord";
import ck from "chalk";
import {
  ApplicationCommand,
  type ApplicationCommandData,
  type ApplicationCommandOptionData,
  ApplicationCommandOptionType,
  type ApplicationCommandSubCommandData,
  type ApplicationCommandSubGroupData,
  ApplicationCommandType,
  AutocompleteInteraction,
  Client,
  Collection,
  CommandInteraction,
  GuildMember,
  Message,
  type PermissionResolvable,
  PermissionsBitField,
} from "discord.js";
import { EzziApp } from "../../app.js";
import {
  type AutocompleteRun,
  type CommandModule,
  type CommandType,
  type GenericAppCommandData,
  IgnoreCommand,
  type OptionNeed,
  type OptionValueType,
  type SlashCommandOptionData,
  type SlashCommandPrimitiveOptionData,
} from "./command.js";
import { CommandContext } from "./context.js";

type StoredAppCommandData = GenericAppCommandData &
  Required<Pick<GenericAppCommandData, "type">> & {
    modules?: CommandModule[];
    category?: string;
  };

type BuildedCommandData = ApplicationCommandData & {
  global?: boolean;
  category?: string;
};

type Runner = Function | null | undefined;

function resolveOptionValueType(
  type: ApplicationCommandOptionType,
): OptionValueType {
  switch (type) {
    case ApplicationCommandOptionType.String:
      return "text";
    case ApplicationCommandOptionType.Number:
      return "number";
    case ApplicationCommandOptionType.Integer:
      return "integer";
    case ApplicationCommandOptionType.User:
      return "user";
    case ApplicationCommandOptionType.Role:
      return "role";
    case ApplicationCommandOptionType.Mentionable:
      return "mentionable";
    case ApplicationCommandOptionType.Channel:
      return "channel";
    case ApplicationCommandOptionType.Attachment:
      return "attachment";
    case ApplicationCommandOptionType.Boolean:
      return "boolean";
    default:
      return "text";
  }
}

function resolveMissingPermissions(
  member: GuildMember | null,
  required: PermissionResolvable[],
): PermissionResolvable[] {
  if (!member || !required.length) return [];
  return required.filter(
    (perm) =>
      !member.permissions.has(
        perm as Parameters<PermissionsBitField["has"]>[0],
      ),
  );
}

export class CommandManager {
  constructor(private app: EzziApp) {}

  private get config() {
    return this.app.config.commands;
  }

  private readonly collection = new Collection<string, StoredAppCommandData>();
  private runtimeCollection = new Collection<string, StoredAppCommandData>();
  private readonly aliasCollection = new Collection<
    string,
    StoredAppCommandData
  >();
  private readonly commandRunners = new Collection<string, Runner[]>();
  private readonly autocompleteRunners = new Collection<
    string,
    AutocompleteRun<string | number, any>
  >();
  private readonly optionDefs = new Collection<
    string,
    SlashCommandPrimitiveOptionData<boolean>[]
  >();
  private readonly shortcuts = new Collection<string, string>();
  private readonly botPermissionsMap = new Collection<
    string,
    PermissionResolvable[]
  >();
  public readonly logs: string[] = [];

  private formatName(
    name: string,
    type = ApplicationCommandType.ChatInput,
  ): string {
    return limitText(
      type === ApplicationCommandType.ChatInput
        ? name.toLowerCase().replaceAll(" ", "")
        : name,
      32,
    );
  }

  public clear(): void {
    this.runtimeCollection = new Collection(this.collection);
    for (const [k, v] of this.aliasCollection) {
      this.runtimeCollection.set(k, v);
    }
    this.collection.clear();
    this.aliasCollection.clear();
  }

  public getAutocompleteHandler(
    ...path: (string | null)[]
  ): AutocompleteRun<string | number, any> | undefined {
    const commandName = path[0];
    const type = ApplicationCommandType.ChatInput;
    const resolved = `/${type}/${path.filter(isDefined).join("/")}`;
    return (
      this.autocompleteRunners.get(resolved) ??
      this.autocompleteRunners.get(`/${type}/${commandName}`)
    );
  }

  public getHandler(
    type: ApplicationCommandType,
    ...path: (string | null)[]
  ): Runner[] | undefined {
    const commandName = path[0];
    const resolved = `/${type}/${path.filter(isDefined).join("/")}`;
    return (
      this.commandRunners.get(resolved) ??
      this.commandRunners.get(`/${type}/${commandName}`)
    );
  }

  public getBotPermissions(path: string): PermissionResolvable[] | undefined {
    return this.botPermissionsMap.get(path);
  }

  public resolveBotPermissions(
    commandName: string,
    subcommandGroup?: string | null,
    subcommand?: string | null,
  ): PermissionResolvable[] | undefined {
    const type = ApplicationCommandType.ChatInput;
    const parts = [commandName, subcommandGroup, subcommand].filter(isDefined);
    const specificPath = `/${type}/${parts.join("/")}`;
    const basePath = `/${type}/${commandName}`;

    return (
      this.botPermissionsMap.get(specificPath) ??
      this.botPermissionsMap.get(basePath)
    );
  }

  public resolvePrefixCommand(
    commandName: string,
    args: string[],
    resolvedCommandData?: StoredAppCommandData,
  ):
    | {
        runners: Runner[];
        optionDefs: SlashCommandPrimitiveOptionData<boolean>[];
        botPermissions?: PermissionResolvable[];
      }
    | undefined {
    const type = ApplicationCommandType.ChatInput;

    const shortcutPath = this.shortcuts.get(commandName);
    if (shortcutPath) {
      const runners = this.commandRunners.get(shortcutPath);
      const defs = this.optionDefs.get(shortcutPath) ?? [];
      const botPermissions = this.botPermissionsMap.get(shortcutPath);
      if (runners) return { runners, optionDefs: defs, botPermissions };
    }

    const rawCommand =
      resolvedCommandData ??
      this.runtimeCollection.get(commandName) ??
      this.collection.get(commandName) ??
      this.aliasCollection.get(commandName);

    if (!rawCommand) return undefined;

    const path: string[] = [rawCommand.name];

    if (rawCommand.modules && rawCommand.modules.length > 0) {
      const nextArg = args[0]?.toLowerCase();
      if (nextArg) {
        const foundModule = rawCommand.modules.find(
          (m) =>
            m.name.toLowerCase() === nextArg ||
            m.aliases?.some((a) => a.toLowerCase() === nextArg),
        );

        if (foundModule) {
          args.shift();
          path.push(foundModule.name);

          if (
            foundModule.type === ApplicationCommandOptionType.SubcommandGroup
          ) {
            const subArg = args[0]?.toLowerCase();
            if (subArg) {
              const foundSub = rawCommand.modules.find(
                (m) =>
                  m.type === ApplicationCommandOptionType.Subcommand &&
                  m.group === foundModule.name &&
                  (m.name.toLowerCase() === subArg ||
                    m.aliases?.some((a) => a.toLowerCase() === subArg)),
              );
              if (foundSub) {
                args.shift();
                path.push(foundSub.name);
              }
            }
          }
        }
      }
    }

    const resolved = `/${type}/${path.join("/")}`;
    const runners = this.commandRunners.get(resolved);
    if (!runners) return undefined;

    const defs = this.optionDefs.get(resolved) ?? [];
    const botPermissions = this.botPermissionsMap.get(resolved);
    return { runners, optionDefs: defs, botPermissions };
  }

  public getTitle(data: GenericAppCommandData): [string, string] {
    const type = data.type ?? ApplicationCommandType.ChatInput;

    if (type === ApplicationCommandType.User) {
      return ["{☰}", "User context menu"];
    }
    if (type === ApplicationCommandType.Message) {
      return ["{☰}", "Message context menu"];
    }

    const ignoreValue = (data as any).ignore;

    if (ignoreValue === IgnoreCommand.Slash) {
      return ["{~}", "Prefix command"];
    }
    if (ignoreValue === IgnoreCommand.Message) {
      return ["{/}", "Slash command"];
    }

    return ["{☰}", "Hybrid command"];
  }

  private buildOptions(
    options: SlashCommandOptionData<boolean>[],
    path: string,
  ): ApplicationCommandOptionData[] {
    const resolved: ApplicationCommandOptionData[] = [];

    for (const option of options) {
      const description = option.description ?? option.name;

      if (
        "autocomplete" in option &&
        option.autocomplete &&
        typeof option.autocomplete === "function"
      ) {
        this.autocompleteRunners.set(
          `${path}/${option.name}`,
          option.autocomplete,
        );
      }

      switch (option.type) {
        case ApplicationCommandOptionType.SubcommandGroup: {
          const {
            options: subcommands,
            defaultMemberPermissions,
            botPermissions,
            ...data
          } = option;
          if (botPermissions?.length) {
            this.botPermissionsMap.set(`${path}/${data.name}`, botPermissions);
          }
          resolved.push({
            ...data,
            description,
            ...(defaultMemberPermissions !== undefined
              ? { defaultMemberPermissions }
              : {}),
            options: this.buildOptions(
              subcommands,
              `${path}/${data.name}`,
            ) as ApplicationCommandSubCommandData[],
          });
          continue;
        }

        case ApplicationCommandOptionType.Subcommand: {
          const {
            options: subOpts,
            defaultMemberPermissions,
            botPermissions,
            ...data
          } = option;
          if (botPermissions?.length) {
            this.botPermissionsMap.set(`${path}/${data.name}`, botPermissions);
          }
          resolved.push({
            ...data,
            description,
            ...(defaultMemberPermissions !== undefined
              ? { defaultMemberPermissions }
              : {}),
            ...(subOpts?.length
              ? {
                  options: this.buildOptions(
                    subOpts,
                    `${path}/${data.name}`,
                  ) as Exclude<
                    ApplicationCommandOptionData,
                    | ApplicationCommandSubGroupData
                    | ApplicationCommandSubCommandData
                  >[],
                }
              : {}),
          });
          continue;
        }

        case ApplicationCommandOptionType.String:
        case ApplicationCommandOptionType.Integer:
        case ApplicationCommandOptionType.Number: {
          const { choices, autocomplete, ...data } = option;
          const validation =
            data.type === ApplicationCommandOptionType.String
              ? { minLength: data.minLength, maxLength: data.maxLength }
              : { minValue: data.minValue, maxValue: data.maxValue };
          const extra = autocomplete
            ? { autocomplete: true, ...validation }
            : choices?.length
              ? { choices: choices.slice(0, 25) }
              : validation;
          resolved.push(Object.assign({ ...data, description, ...extra }));
          continue;
        }

        default: {
          resolved.push({ ...option, description });
        }
      }
    }

    return resolved;
  }

  private resolveModules(
    modules: CommandModule[],
    path: string,
    parentRun?: Function,
  ): SlashCommandOptionData<boolean>[] {
    const resolved: SlashCommandOptionData<boolean>[] = [];
    if (!modules.length) return resolved;

    const groups = modules.filter(
      (m) => m.type === ApplicationCommandOptionType.SubcommandGroup,
    );
    const subcommands = modules.filter(
      (m) => m.type === ApplicationCommandOptionType.Subcommand,
    );

    for (const group of groups) {
      const groupSubs = subcommands.filter((s) => s.group === group.name);
      const slashSubs = groupSubs.filter(
        (s) => (s.ignore as unknown) !== IgnoreCommand.Slash,
      );

      const mappedSubs = slashSubs.map((sub) => ({
        ...sub,
        type: ApplicationCommandOptionType.Subcommand as const,
      }));

      resolved.push({ ...group, options: mappedSubs });

      if (group.botPermissions?.length) {
        this.botPermissionsMap.set(
          `${path}/${group.name}`,
          group.botPermissions,
        );
      }

      for (const sub of groupSubs) {
        if ((sub.ignore as unknown) === IgnoreCommand.Slash) continue;

        const subPath = `${path}/${group.name}/${sub.name}`;
        this.commandRunners.set(
          subPath,
          [parentRun, group.run, sub.run].filter(isDefined),
        );

        if (sub.options?.length) {
          this.optionDefs.set(
            subPath,
            sub.options as SlashCommandPrimitiveOptionData<boolean>[],
          );
        }

        if (sub.botPermissions?.length) {
          this.botPermissionsMap.set(subPath, sub.botPermissions);
        }

        if (sub.shortcut) {
          this.shortcuts.set(sub.name, subPath);
          for (const alias of sub.aliases ?? []) {
            this.shortcuts.set(alias, subPath);
          }
        }
      }
    }

    for (const sub of subcommands.filter((s) => !s.group)) {
      if ((sub.ignore as unknown) === IgnoreCommand.Slash) continue;

      const subPath = `${path}/${sub.name}`;
      this.commandRunners.set(subPath, [parentRun, sub.run].filter(isDefined));

      if (sub.options?.length) {
        this.optionDefs.set(
          subPath,
          sub.options as SlashCommandPrimitiveOptionData<boolean>[],
        );
      }

      if (sub.botPermissions?.length) {
        this.botPermissionsMap.set(subPath, sub.botPermissions);
      }

      if (sub.shortcut) {
        this.shortcuts.set(sub.name, subPath);
        for (const alias of sub.aliases ?? []) {
          this.shortcuts.set(alias, subPath);
        }
      }

      resolved.push(sub);
    }

    return resolved;
  }

  public set(data: GenericAppCommandData): StoredAppCommandData {
    const type = data.type ?? ApplicationCommandType.ChatInput;
    const name = this.formatName(data.name, type);
    const dmPermission = data.dmPermission ?? false;
    const commandData: StoredAppCommandData = {
      ...data,
      name,
      type,
      dmPermission,
    };

    if (this.collection.has(name)) {
      const existing = this.collection.get(name)!;
      const canonicalPath = `/${type}/${name}`;
      this.commandRunners.delete(canonicalPath);
      this.optionDefs.delete(canonicalPath);
      this.botPermissionsMap.delete(canonicalPath);
      this.autocompleteRunners.delete(canonicalPath);
      if (existing.aliases?.length) {
        for (const alias of existing.aliases) {
          this.aliasCollection.delete(this.formatName(alias, type));
        }
      }
    }

    this.collection.set(name, commandData);

    const canonicalPath = `/${type}/${name}`;
    this.commandRunners.set(canonicalPath, [data.run]);

    if (data.botPermissions?.length) {
      this.botPermissionsMap.set(canonicalPath, data.botPermissions);
    }

    if (data.aliases?.length) {
      for (const alias of data.aliases) {
        const aliasName = this.formatName(alias, type);
        this.aliasCollection.set(aliasName, commandData);
      }
    }

    if (data.options?.length) {
      const primitive = (
        data.options as SlashCommandOptionData<boolean>[]
      ).filter(
        (o) =>
          o.type !== ApplicationCommandOptionType.Subcommand &&
          o.type !== ApplicationCommandOptionType.SubcommandGroup,
      ) as SlashCommandPrimitiveOptionData<boolean>[];

      if (primitive.length) {
        this.optionDefs.set(canonicalPath, primitive);
      }
    }

    if ("autocomplete" in data && data.autocomplete) {
      this.autocompleteRunners.set(canonicalPath, data.autocomplete);
    }

    return commandData;
  }

  public build(): BuildedCommandData[] {
    const result = Array.from(this.collection.values())
      .filter((raw) => (raw.ignore as unknown) !== IgnoreCommand.Slash)
      .map((raw) => {
        const {
          options,
          modules,
          description,
          descriptionLocalizations,
          category,
          botPermissions: _bp,
          ...data
        } = raw;

        const path = `/${data.type}/${data.name}`;

        const slashData =
          data.type === ApplicationCommandType.ChatInput
            ? {
                description: description ?? data.name,
                descriptionLocalizations,
                options: this.buildOptions(
                  [
                    ...(options ?? []),
                    ...this.resolveModules(modules ?? [], path, data.run),
                  ] as SlashCommandOptionData<boolean>[],
                  path,
                ),
              }
            : {};

        return { ...data, ...slashData, category };
      }) as BuildedCommandData[];

    return result;
  }

  public addLog(data: GenericAppCommandData): void {
    const [icon, label] = this.getTitle(data);

    this.logs.push(
      ck.green(
        spaceBuilder(
          ck.gray(icon),
          ck.green(`${label}`),
          ck.gray(">"),
          ck.underline.blue(data.name),
          ck.bold("✓"),
        ),
      ),
    );
  }

  public addModule(commandName: string, module: CommandModule): void {
    const command = this.collection.get(commandName);
    if (!command) return;
    command.modules ??= [];
    command.modules.push(module);
  }

  public getPrefixCommandCount(): number {
    return Array.from(this.runtimeCollection.values()).filter(
      (cmd) => (cmd.ignore as unknown) !== IgnoreCommand.Slash,
    ).length;
  }

  public async onAutocomplete(
    interaction: AutocompleteInteraction,
  ): Promise<void> {
    const options = interaction.options;

    const handler = this.getAutocompleteHandler(
      interaction.commandName,
      options.getSubcommandGroup(false),
      options.getSubcommand(false),
      options.getFocused(true).name,
    );
    if (!handler) return;

    const choices = await handler(interaction);
    if (choices && Array.isArray(choices)) {
      await interaction.respond(choices.slice(0, 25));
    }
  }

  public async onPrefixCommand(message: Message): Promise<void> {
    if (message.author.bot) return;
    if (!this.config.prefix) return;

    const prefixes = await this.config.prefix(message);
    const prefix = prefixes.find((p) =>
      message.content.toLowerCase().startsWith(p.toLowerCase()),
    );
    if (!prefix) return;

    const rawArgs = message.content.slice(prefix.length).trim().split(/ +/);
    const commandName = rawArgs.shift()?.toLowerCase();
    if (!commandName) return;

    const rawCommandData =
      this.runtimeCollection.get(commandName) ??
      this.collection.get(commandName) ??
      this.aliasCollection.get(commandName);

    if (rawCommandData?.ignore === IgnoreCommand.Message) return;

    const args = [...rawArgs];
    const resolved = this.resolvePrefixCommand(
      commandName,
      args,
      rawCommandData,
    );
    if (!resolved) return;

    const { runners, optionDefs, botPermissions } = resolved;
    const ctx = new CommandContext(message.client, message, args, optionDefs);
    const {
      middleware,
      onMemberPermissionsFailed,
      onBotPermissionsFailed,
      onOptionsError,
      onError,
    } = this.config;

    if (middleware) {
      let isBlock = false;
      const block = () => {
        isBlock = true;
      };
      await middleware(ctx, block);
      if (isBlock) return;
    }

    if (onMemberPermissionsFailed && rawCommandData?.defaultMemberPermissions) {
      const perms = Array.isArray(rawCommandData.defaultMemberPermissions)
        ? (rawCommandData.defaultMemberPermissions as PermissionResolvable[])
        : [rawCommandData.defaultMemberPermissions as PermissionResolvable];
      const missing = resolveMissingPermissions(
        message.member as GuildMember | null,
        perms,
      );
      if (missing.length) {
        onMemberPermissionsFailed(ctx, missing);
        return;
      }
    }

    if (onBotPermissionsFailed && botPermissions?.length) {
      const botMember = message.guild?.members.me ?? null;
      const missing = resolveMissingPermissions(botMember, botPermissions);
      if (missing.length) {
        onBotPermissionsFailed(ctx, missing);
        return;
      }
    }

    if (onOptionsError && optionDefs.length) {
      const missing: OptionNeed[] = optionDefs
        .filter(
          (def) => def.required && args[optionDefs.indexOf(def)] === undefined,
        )
        .map((def) => ({
          name: def.name,
          description: def.description ?? def.name,
          value: resolveOptionValueType(def.type),
        }));

      if (missing.length > 0) {
        onOptionsError(message, missing);
        return;
      }
    }

    try {
      let result: unknown;
      for (const run of runners.filter(isDefined)) {
        result = await (run as Function)(ctx, result);
      }
    } catch (err) {
      if (onError) {
        console.error(`Error in prefix command [${commandName}]:`, err);
        onError(ctx, err);
      } else {
        throw err;
      }
    }
  }

  public async onCommand(interaction: CommandInteraction): Promise<void> {
    if (interaction.isPrimaryEntryPointCommand()) return;

    const {
      onNotFound,
      middleware,
      onError,
      onMemberPermissionsFailed,
      onBotPermissionsFailed,
    } = this.config;

    const path: (string | null)[] = [interaction.commandName];
    let subcommandGroup: string | null = null;
    let subcommand: string | null = null;

    if (interaction.isChatInputCommand()) {
      subcommandGroup = interaction.options.getSubcommandGroup(false);
      subcommand = interaction.options.getSubcommand(false);
      path.push(subcommandGroup, subcommand);
    }

    const handler = this.getHandler(interaction.commandType, ...path);
    if (!handler) {
      return onNotFound?.(interaction);
    }

    const rawCommandData =
      this.runtimeCollection.get(interaction.commandName) ??
      this.collection.get(interaction.commandName);
    if (rawCommandData?.ignore === IgnoreCommand.Slash) {
      return onNotFound?.(interaction);
    }

    const ctx = new CommandContext(interaction.client, interaction, []);

    if (middleware) {
      let isBlock = false;
      const block = () => {
        isBlock = true;
      };
      await middleware(ctx, block);
      if (isBlock) return;
    }

    if (onMemberPermissionsFailed && rawCommandData?.defaultMemberPermissions) {
      const perms = Array.isArray(rawCommandData.defaultMemberPermissions)
        ? (rawCommandData.defaultMemberPermissions as PermissionResolvable[])
        : [rawCommandData.defaultMemberPermissions as PermissionResolvable];
      const missing = resolveMissingPermissions(
        interaction.member instanceof GuildMember ? interaction.member : null,
        perms,
      );
      if (missing.length) {
        onMemberPermissionsFailed(ctx, missing);
        return;
      }
    }

    if (onBotPermissionsFailed) {
      const botPermissions = this.resolveBotPermissions(
        interaction.commandName,
        subcommandGroup,
        subcommand,
      );
      if (botPermissions?.length) {
        const botMember = interaction.guild?.members.me ?? null;
        const missing = resolveMissingPermissions(botMember, botPermissions);
        if (missing.length) {
          onBotPermissionsFailed(ctx, missing);
          return;
        }
      }
    }

    try {
      let result: unknown;
      for (const run of handler.filter(isDefined)) {
        result = await (run as Function)(ctx, result);
      }
    } catch (err) {
      if (onError) {
        onError(ctx, err);
        return;
      }
      throw err;
    }
  }

  public async register(client: Client<true>): Promise<void> {
    const messages: string[] = [];
    const pluralize = (n: number) => (n > 1 ? "s" : "");
    const commands = this.build();

    const createVerboseLogs = (
      cmdsCollection: Collection<string, ApplicationCommand>,
    ) =>
      cmdsCollection.map(({ id, name, type, client: cl, createdAt, guild }) => {
        const [icon] = this.getTitle({
          type: type as CommandType,
        } as GenericAppCommandData);
        return ck.dim.green(
          spaceBuilder(
            ` └ ${icon}`,
            ck.underline.cyan(id),
            "CREATED",
            ck.underline.blue(name),
            ck.gray(">"),
            guild
              ? `${ck.blue(guild.name)} guild`
              : `${ck.blue(cl.user.username)} application`,
            ck.gray(">"),
            "created at:",
            ck.greenBright(createdAt.toLocaleTimeString()),
          ),
        );
      });

    const logRegistration = (
      cmdsCollection: Collection<string, ApplicationCommand>,
      location: string,
    ) => {
      if (!cmdsCollection.size) return;
      messages.push(
        ck.greenBright(
          `└ ${cmdsCollection.size} command${pluralize(cmdsCollection.size)} successfully registered ${location}!`,
        ),
      );
      if (this.config.verbose) {
        messages.push(...createVerboseLogs(cmdsCollection));
      }
    };

    const targetGuilds = client.guilds.cache.filter(({ id }) =>
      this.config.guilds?.includes(id),
    );

    if (targetGuilds.size) {
      const globalCommands = commands.filter((c) => c.global);
      const guildCommands = commands.filter((c) => !c.global);

      await client.application.commands.set(globalCommands).then((cmds) => {
        if (!cmds.size) return;
        logRegistration(cmds, "globally");
      });

      for (const guild of targetGuilds.values()) {
        const cmds = await guild.commands.set(guildCommands);
        logRegistration(cmds, `in ${ck.underline(guild.name)} guild`);
      }
    } else {
      await Promise.all(
        client.guilds.cache.map((guild) => guild.commands.set([])),
      );

      await client.application.commands
        .set(commands)
        .then((cmds) => logRegistration(cmds, "globally"));
    }

    const prefixCount = this.getPrefixCommandCount();
    if (prefixCount > 0 && this.config.prefix) {
      messages.push(
        ck.greenBright(
          `└ ${prefixCount} prefix command${pluralize(prefixCount)} available!`,
        ),
      );
    }
    this.clear();

    if (messages.length) {
      console.log(messages.join("\n"));
    }
  }
}
