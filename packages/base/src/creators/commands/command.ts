import {
    type APIInteractionDataResolvedGuildMember,
    type APIRole,
    type ApplicationCommandOptionAllowedChannelTypes,
    type ApplicationCommandOptionChoiceData,
    ApplicationCommandOptionType,
    ApplicationCommandType,
    Attachment,
    AutocompleteInteraction,
    type BaseApplicationCommandData,
    type CacheType,
    type Channel,
    ChatInputCommandInteraction,
    GuildMember,
    InteractionContextType,
    type LocalizationMap,
    MessageContextMenuCommandInteraction,
    type PermissionResolvable,
    Role,
    User,
    UserContextMenuCommandInteraction,
} from "discord.js";
import type { NotEmptyArray, UniqueArray } from "../../utils/types.js";
import { CommandContext } from "./context.js";

export const IgnoreCommand = {
    Slash: "slash",
    Message: "message",
} as const;

export type IgnoreCommandType = (typeof IgnoreCommand)[keyof typeof IgnoreCommand];

export type CommandType = Exclude<
    ApplicationCommandType,
    ApplicationCommandType.PrimaryEntryPoint
>;

export type CommandContextOptions = {
    getString(name: string, required?: boolean): string | null;
    getNumber(name: string, required?: boolean): number | null;
    getInteger(name: string, required?: boolean): number | null;
    getBoolean(name: string, required?: boolean): boolean | null;
    getUser(name: string, required?: boolean): User | null;
    getMember(name: string): GuildMember | APIInteractionDataResolvedGuildMember | null;
    getRole(name: string, required?: boolean): Role | APIRole | null;
    getChannel(name: string, required?: boolean): ReturnType<ChatInputCommandInteraction["options"]["getChannel"]> | Channel | null;
    getMentionable(name: string, required?: boolean): User | GuildMember | Role | APIInteractionDataResolvedGuildMember | APIRole | null;
    getAttachment(name: string, required?: boolean): Attachment | null;
    getSubcommand(required?: true): string | null;
    getSubcommandGroup(required?: true): string | null;
};

export type CommandCategoryType = string;

export type OptionValueType =
    | "text"
    | "number"
    | "integer"
    | "user"
    | "role"
    | "mentionable"
    | "channel"
    | "attachment"
    | "boolean";

export interface OptionNeed {
    name: string;
    description: string;
    value: OptionValueType;
}

type AutocompleteData<T> = Promise<
    | readonly ApplicationCommandOptionChoiceData<T extends number | string ? T : number | string>[]
    | undefined
    | void
>;

export type CacheMode<Contexts> = Contexts extends readonly InteractionContextType[]
    ? {
        [InteractionContextType.Guild]: "cached";
        [InteractionContextType.BotDM]: CacheType;
        [InteractionContextType.PrivateChannel]: CacheType;
    }[Contexts[number]]
    : CacheType;

export type AutocompleteRun<T, Contexts> = (
    this: void,
    interaction: AutocompleteInteraction<CacheMode<Contexts>>,
) => AutocompleteData<T>;

interface AutocompleteOptionData<T, Contexts> {
    autocomplete?: true | AutocompleteRun<T, Contexts>;
}

interface BaseOptionData {
    name: string;
    nameLocalizations?: LocalizationMap;
    description?: string;
    descriptionLocalizations?: LocalizationMap;
    required?: boolean;
}

interface StringOptionData<Contexts> extends BaseOptionData, AutocompleteOptionData<string, Contexts> {
    type: ApplicationCommandOptionType.String;
    choices?: readonly ApplicationCommandOptionChoiceData<string>[];
    minLength?: number;
    maxLength?: number;
}

interface NumberOptionData<Contexts> extends BaseOptionData, AutocompleteOptionData<number, Contexts> {
    type: ApplicationCommandOptionType.Number | ApplicationCommandOptionType.Integer;
    choices?: readonly ApplicationCommandOptionChoiceData<number>[];
    minValue?: number;
    maxValue?: number;
}

interface ChannelOptionData extends BaseOptionData {
    type: ApplicationCommandOptionType.Channel;
    channelTypes?: readonly ApplicationCommandOptionAllowedChannelTypes[];
}

interface CommonOptionData extends BaseOptionData {
    type:
        | ApplicationCommandOptionType.Attachment
        | ApplicationCommandOptionType.Boolean
        | ApplicationCommandOptionType.Mentionable
        | ApplicationCommandOptionType.Role
        | ApplicationCommandOptionType.User;
}

export type SlashCommandPrimitiveOptionData<Contexts> =
    | StringOptionData<Contexts>
    | NumberOptionData<Contexts>
    | CommonOptionData
    | ChannelOptionData;

export interface SubCommandOptionData<Contexts> extends Omit<BaseOptionData, "required"> {
    type: ApplicationCommandOptionType.Subcommand;
    defaultMemberPermissions?: PermissionResolvable;
    botPermissions?: PermissionResolvable[];
    options?: SlashCommandPrimitiveOptionData<Contexts>[];
}

export interface GroupOptionData<Contexts> extends Omit<BaseOptionData, "required"> {
    type: ApplicationCommandOptionType.SubcommandGroup;
    defaultMemberPermissions?: PermissionResolvable;
    botPermissions?: PermissionResolvable[];
    options: SubCommandOptionData<Contexts>[];
}

export type SlashCommandOptionData<Contexts> =
    | SlashCommandPrimitiveOptionData<Contexts>
    | GroupOptionData<Contexts>
    | SubCommandOptionData<Contexts>;

export type RunInteraction<T, Contexts> =
    T extends ApplicationCommandType.Message
        ? MessageContextMenuCommandInteraction<CacheMode<Contexts>>
        : T extends ApplicationCommandType.User
            ? UserContextMenuCommandInteraction<CacheMode<Contexts>>
            : ChatInputCommandInteraction<CacheMode<Contexts>>;

interface CommandRunThis {
    block(): never;
}

type BaseAppCommandData = Omit<BaseApplicationCommandData, "contexts" | "dmPermission"> &
    Pick<BaseOptionData, "descriptionLocalizations">;

type ResolveCommandModuleData<R> = R extends void ? undefined : R;

export type SubCommandModuleData<Contexts, R> = Omit<BaseOptionData, "required"> & {
    group?: string;
    shortcut?: boolean;
    aliases?: string[];
    ignore?: IgnoreCommandType;
    defaultMemberPermissions?: PermissionResolvable;
    botPermissions?: PermissionResolvable[];
    run(
        this: CommandRunThis,
        ctx: CommandContext,
        data: ResolveCommandModuleData<R>,
    ): Promise<void>;
    options?: SlashCommandPrimitiveOptionData<Contexts>[];
};

export type SubCommandGroupModuleData<Contexts, R, T> = Omit<BaseOptionData, "required"> & {
    aliases?: string[];
    defaultMemberPermissions?: PermissionResolvable;
    botPermissions?: PermissionResolvable[];
    options?: Omit<SubCommandOptionData<Contexts>, "type">[];
    run?(
        this: CommandRunThis,
        ctx: CommandContext,
        data: ResolveCommandModuleData<R>,
    ): Promise<T>;
};

export type CommandModule =
    | (SubCommandGroupModuleData<any, any, any> & {
          type: ApplicationCommandOptionType.SubcommandGroup;
      })
    | (SubCommandModuleData<any, any> & {
          type: ApplicationCommandOptionType.Subcommand;
          group?: string;
      });

export interface AppCommandData<T, Contexts, R> extends BaseAppCommandData {
    name: string;
    aliases?: string[];
    category?: CommandCategoryType;
    description?: string;
    contexts?: NotEmptyArray<UniqueArray<Contexts>>;
    dmPermission?: boolean;
    type?: T;
    global?: boolean;
    ignore?: IgnoreCommandType;
    botPermissions?: PermissionResolvable[];
    run?(this: CommandRunThis, ctx: CommandContext): Promise<R>;
    autocomplete?: AutocompleteRun<string | number, Contexts>;
    options?:
        | SlashCommandPrimitiveOptionData<Contexts>[]
        | (GroupOptionData<Contexts> | SubCommandOptionData<Contexts>)[];
}

export type GenericAppCommandData = AppCommandData<CommandType, readonly InteractionContextType[], unknown>;

class GroupCommandModule<
    Type,
    Contexts extends readonly InteractionContextType[],
    Return,
    ModuleReturn,
> {
    constructor(
        public readonly command: Command<Type, Contexts, Return>,
        public readonly data: SubCommandGroupModuleData<Contexts, Return, ModuleReturn>,
    ) {}

    public subcommand(data: SubCommandModuleData<Contexts, ModuleReturn>) {
        data.group ??= this.data.name;
        this.command.subcommand(data);
        return this;
    }
}

export class Command<
    Type,
    Contexts extends readonly InteractionContextType[] = readonly InteractionContextType[],
    Return = unknown,
> {
    public readonly modules: CommandModule[] = [];
    public readonly data: AppCommandData<Type, Contexts, Return>;
    public moduleListener?: (module: CommandModule) => void;

    constructor(data: AppCommandData<Type, Contexts, Return>) {
        this.data = data;
        this.data.type ??= ApplicationCommandType.ChatInput as unknown as Type;

        if ((this.data.type as unknown) === ApplicationCommandType.ChatInput) {
            this.data.description ??= this.data.name;
            this.data.name = this.data.name
                .toLowerCase()
                .replaceAll(" ", "");
        }
        if (this.data.name.length > 32) {
            this.data.name = this.data.name.slice(0, 32);
        }
        if (!this.data.contexts) {
            this.data.contexts = [InteractionContextType.Guild] as unknown as NotEmptyArray<UniqueArray<Contexts>>;
        }
    }

    public group<ModuleReturn = Return>(data: SubCommandGroupModuleData<Contexts, Return, ModuleReturn>) {
        const module = {
            ...data,
            type: ApplicationCommandOptionType.SubcommandGroup,
        } as CommandModule;
        this.modules.push(module);
        this.moduleListener?.(module);
        return new GroupCommandModule<Type, Contexts, Return, ModuleReturn>(this, data);
    }

    public subcommand<R = Return>(data: SubCommandModuleData<Contexts, R>) {
        const module = {
            ...data,
            type: ApplicationCommandOptionType.Subcommand,
        } as CommandModule;
        this.modules.push(module);
        this.moduleListener?.(module);
        return this;
    }
}