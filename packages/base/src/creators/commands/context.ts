import {
    type APIInteractionDataResolvedGuildMember,
    type APIRole,
    ApplicationCommandOptionType,
    Attachment,
    type Channel,
    Client,
    CommandInteraction,
    GuildMember,
    type InteractionEditReplyOptions,
    type InteractionReplyOptions,
    Message,
    type MessageEditOptions,
    type MessageReplyOptions,
    Role,
    User,
} from "discord.js";
import type { CommandContextOptions, SlashCommandPrimitiveOptionData } from "./command.js";

type Source = Message | CommandInteraction;
type ReplyOptions = string | InteractionReplyOptions | MessageReplyOptions;
type EditOptions = string | InteractionEditReplyOptions | MessageEditOptions;


interface ParsedOption {
    name: string;
    value: string | number | boolean | User | GuildMember | Role | Channel | Attachment | null;
}

export class CommandContext {
    private _botReply: Message | null = null;
    public readonly args: string[];

    private _parsedOptions: Map<string, ParsedOption> = new Map();

    constructor(
        public readonly client: Client,
        public readonly source: Source,
        args: string[] = [],
        optionDefs: SlashCommandPrimitiveOptionData<boolean>[] = [],
    ) {
        this.args = args;
        if (source instanceof Message && args.length && optionDefs.length) {
            this._parsePrefixOptions(args, optionDefs);
        }
    }

    private _parsePrefixOptions(
        args: string[],
        defs: SlashCommandPrimitiveOptionData<boolean>[],
    ): void {
        defs.forEach((def, index) => {
            const raw = args[index];
            if (raw === undefined) return;

            let value: string | number | boolean | User | GuildMember | Role | Channel | Attachment | null = null;

            switch (def.type) {
                case ApplicationCommandOptionType.Integer:
                    value = parseInt(raw, 10);
                    if (isNaN(value as number)) value = null;
                    break;
                case ApplicationCommandOptionType.Number:
                    value = parseFloat(raw);
                    if (isNaN(value as number)) value = null;
                    break;
                case ApplicationCommandOptionType.Boolean:
                    value = raw === "true" || raw === "1" || raw === "yes";
                    break;
                default:
                    value = raw;
            }

            this._parsedOptions.set(def.name, { name: def.name, value });
        });
    }

    get user() {
        return this.source instanceof Message
            ? this.source.author
            : this.source.user;
    }

    get member() {
        return this.source.member instanceof GuildMember
            ? this.source.member
            : null;
    }

    get message() {
        return this.source instanceof Message ? this.source : null;
    }

    get guild() {
        return this.source.guild;
    }

    get guildId() {
        return this.source.guildId
    }

    get channel() {
        return this.source.channel;
    }

    public isInteraction(): this is CommandContext & { source: CommandInteraction } {
        return this.source instanceof CommandInteraction;
    }

    public isMessage(): this is CommandContext & { source: Message } {
        return this.source instanceof Message;
    }

    get options(): CommandContextOptions {
        return {
            getString: (name: string, required?: boolean | undefined) => {
                if (this.isInteraction() && this.source.isChatInputCommand()) {
                    return this.source.options.getString(name, required);
                }
                return this._parsedOptions.get(name)?.value as string | null;
            },
            getNumber: (name: string, required?: boolean | undefined) => {
                if (this.isInteraction() && this.source.isChatInputCommand()) {
                    return this.source.options.getNumber(name, required);
                }
                return this._parsedOptions.get(name)?.value as number | null;
            },
            getInteger: (name: string, required?: boolean | undefined) => {
                if (this.isInteraction() && this.source.isChatInputCommand()) {
                    return this.source.options.getInteger(name, required);
                }
                return this._parsedOptions.get(name)?.value as number | null;
            },
            getBoolean: (name: string, required?: boolean | undefined) => {
                if (this.isInteraction() && this.source.isChatInputCommand()) {
                    return this.source.options.getBoolean(name, required);
                }
                return this._parsedOptions.get(name)?.value as boolean | null;
            },
            getUser: (name: string, required?: boolean | undefined) => {
                if (this.isInteraction() && this.source.isChatInputCommand()) {
                    return this.source.options.getUser(name, required);
                }
                return this._parsedOptions.get(name)?.value as User | null;
            },
            getMember: (name: string) => {
                if (this.isInteraction() && this.source.isChatInputCommand()) {
                    return this.source.options.getMember(name);
                }
                return this._parsedOptions.get(name)?.value as GuildMember | null;
            },
            getRole: (name: string, required?: boolean | undefined) => {
                if (this.isInteraction() && this.source.isChatInputCommand()) {
                    return this.source.options.getRole(name, required);
                }
                return this._parsedOptions.get(name)?.value as Role | null;
            },
            getChannel: (name: string, required?: boolean | undefined) => {
                if (this.isInteraction() && this.source.isChatInputCommand()) {
                    return this.source.options.getChannel(name, required);
                }
                return this._parsedOptions.get(name)?.value as Channel | null;
            },
            getMentionable: (name: string, required?: boolean | undefined) => {
                if (this.isInteraction() && this.source.isChatInputCommand()) {
                    return this.source.options.getMentionable(name, required);
                }
                return this._parsedOptions.get(name)?.value as User | GuildMember | Role | APIInteractionDataResolvedGuildMember | APIRole | null;
            },
            getAttachment: (name: string, required?: boolean | undefined) => {
                if (this.isInteraction() && this.source.isChatInputCommand()) {
                    return this.source.options.getAttachment(name, required);
                }
                return this._parsedOptions.get(name)?.value as Attachment | null;
            },
            getSubcommand: (required?: true | undefined) => {
                if (this.isInteraction() && this.source.isChatInputCommand()) {
                    try {
                        return this.source.options.getSubcommand(required);
                    } catch {
                        return null;
                    }
                }
                return this._parsedOptions.get("subcommand")?.value as string | null;
            },
            getSubcommandGroup: (required?: true | undefined) => {
                if (this.isInteraction() && this.source.isChatInputCommand()) {
                    try {
                        return this.source.options.getSubcommandGroup(required);
                    } catch {
                        return null;
                    }
                }
                return this._parsedOptions.get("subcommandGroup")?.value as string | null;
            },
        }
    }

    public getRaw(name: string): string | null {
        if (this.isInteraction()) return null;
        return this._parsedOptions.get(name)?.value as string | null;
    }

    public async deferReply(ephemeral = false): Promise<void> {
        if (
            this.isInteraction() &&
            !this.source.replied &&
            !this.source.deferred
        ) {
            await this.source.deferReply(
                ephemeral ? { flags: ["Ephemeral"] } : {},
            );
        }
    }

    public async reply(options: ReplyOptions): Promise<Message | undefined> {
        const payload =
            typeof options === "string" ? { content: options } : options;

        if (this.source instanceof Message) {
            const sent = await this.source.reply(
                payload as MessageReplyOptions,
            );
            this._botReply = sent;
            return sent;
        }

        if (this.isInteraction()) {
            if (this.source.replied || this.source.deferred) {
                return this.source.followUp(
                    payload as InteractionReplyOptions,
                ) as Promise<Message>;
            }
            return this.source.reply(
                payload as InteractionReplyOptions,
            ) as unknown as Promise<Message>;
        }

        return undefined;
    }

    public async editReply(
        options: EditOptions,
    ): Promise<Message | undefined> {
        const payload =
            typeof options === "string" ? { content: options } : options;

        if (this.isInteraction()) {
            return this.source.editReply(
                payload as InteractionEditReplyOptions,
            ) as Promise<Message>;
        }

        if (this.source instanceof Message && this._botReply) {
            return this._botReply.edit(payload as MessageEditOptions);
        }

        return undefined;
    }

    public async delete(): Promise<void> {
        if (
            this.isInteraction() &&
            (this.source.replied || this.source.deferred)
        ) {
            await this.source.deleteReply();
            return;
        }

        if (this.source instanceof Message) {
            await this.source.delete();
        }
    }
}