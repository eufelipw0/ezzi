import { LithiumApp } from "../app.js";
import {
  IgnoreCommand,
  type SubCommandGroupModuleData,
  type SubCommandModuleData,
} from "../creators/commands/command.js";
import {
  ApplicationCommandOptionType,
  Client,
  type LocalizationMap,
} from "discord.js";

const optionTypes: Record<number, string> = {
  3: "string",
  4: "integer",
  5: "boolean",
  6: "user",
  7: "channel",
  8: "role",
  9: "mention",
  10: "number",
  11: "file",
};

export interface ParsedCommand {
  id: string | null;
  name: string;
  description: string;
  category: string;
  options: string;
  slash: { id: string; name: string } | null;
  localizations?: LocalizationMap;
  aliases?: string[];
}

type ResolvedSubModule = SubCommandModuleData<boolean, unknown> & {
  type: ApplicationCommandOptionType.Subcommand;
};

type ResolvedGroupModule = SubCommandGroupModuleData<
  boolean,
  unknown,
  unknown
> & {
  type: ApplicationCommandOptionType.SubcommandGroup;
};

function sanitizeLocalizations(
  localizations?: LocalizationMap | null,
): LocalizationMap | undefined {
  if (!localizations) return undefined;
  const sanitized: LocalizationMap = {};
  for (const [locale, translation] of Object.entries(localizations)) {
    if (translation === null) {
      sanitized[locale as keyof LocalizationMap] = null;
      continue;
    }
    sanitized[locale as keyof LocalizationMap] = translation;
  }
  return sanitized;
}

export function parseCommands(client: Client): ParsedCommand[] {
  const discordCommands = client.application?.commands.cache;
  const app = LithiumApp.getInstance();
  const localCommands = app.commands["collection"];

  if (!localCommands) return [];

  const parsedList: ParsedCommand[] = [];

  for (const [_, localCmd] of localCommands) {
    const discordCmd = discordCommands?.find((c) => c.name === localCmd.name);

    const isRootSlashIgnored = (localCmd as any).ignore === IgnoreCommand.Slash;

    if (!discordCmd && !isRootSlashIgnored) continue;

    const id = discordCmd?.id ?? null;
    const category = localCmd.category || "Utils";
    const cmdAliases = localCmd.aliases;

    if (!localCmd.modules || localCmd.modules.length === 0) {
      parsedList.push({
        id,
        name: localCmd.name,
        description: localCmd.description || "",
        category,
        options: formatOptions(localCmd.options || []),
        slash: isRootSlashIgnored || !id ? null : { id, name: localCmd.name },
        localizations: sanitizeLocalizations(localCmd.descriptionLocalizations),
        aliases: cmdAliases,
      });
      continue;
    }

    if (localCmd.modules) {
      const subcommands = localCmd.modules.filter(
        (m) => m.type === ApplicationCommandOptionType.Subcommand && !m.group,
      );
      const groups = localCmd.modules.filter(
        (m) => m.type === ApplicationCommandOptionType.SubcommandGroup,
      );

      for (const localSub of subcommands as ResolvedSubModule[]) {
        const isSlashIgnored = localSub.ignore === IgnoreCommand.Slash;
        const isMessageIgnored = localSub.ignore === IgnoreCommand.Message;

        const fullAliases: string[] = [];
        if (!isMessageIgnored) {
          const cmdNames = [localCmd.name, ...(cmdAliases ?? [])];
          const subNames = [localSub.name, ...(localSub.aliases ?? [])];

          for (const c of cmdNames) {
            for (const s of subNames) {
              if (c === localCmd.name && s === localSub.name) continue;
              fullAliases.push(`${c} ${s}`);
            }
          }

          if (localSub.shortcut) {
            fullAliases.push(localSub.name, ...(localSub.aliases ?? []));
          }
        }

        parsedList.push({
          id,
          name: `${localCmd.name} ${localSub.name}`,
          description: localSub.description || "",
          category,
          options: formatOptions(localSub.options || []),
          slash:
            isSlashIgnored || !id
              ? null
              : { id, name: `${localCmd.name} ${localSub.name}` },
          localizations: sanitizeLocalizations(
            localSub.descriptionLocalizations,
          ),
          aliases: isMessageIgnored
            ? []
            : fullAliases.length
              ? fullAliases
              : undefined,
        });
      }

      for (const localGroup of groups as ResolvedGroupModule[]) {
        const groupSubs = localCmd.modules.filter(
          (m) =>
            m.type === ApplicationCommandOptionType.Subcommand &&
            m.group === localGroup.name,
        ) as ResolvedSubModule[];

        for (const localSub of groupSubs) {
          const isSlashIgnored = localSub.ignore === IgnoreCommand.Slash;
          const isMessageIgnored = localSub.ignore === IgnoreCommand.Message;

          const fullAliases: string[] = [];
          if (!isMessageIgnored) {
            const cmdNames = [localCmd.name, ...(cmdAliases ?? [])];
            const groupNames = [localGroup.name, ...(localGroup.aliases ?? [])];
            const subNames = [localSub.name, ...(localSub.aliases ?? [])];

            for (const c of cmdNames) {
              for (const g of groupNames) {
                for (const s of subNames) {
                  if (
                    c === localCmd.name &&
                    g === localGroup.name &&
                    s === localSub.name
                  )
                    continue;
                  fullAliases.push(`${c} ${g} ${s}`);
                }
              }
            }

            if (localSub.shortcut) {
              fullAliases.push(localSub.name, ...(localSub.aliases ?? []));
            }
          }

          parsedList.push({
            id,
            name: `${localCmd.name} ${localGroup.name} ${localSub.name}`,
            description: localSub.description || "",
            category,
            options: formatOptions(localSub.options || []),
            slash:
              isSlashIgnored || !id
                ? null
                : {
                    id,
                    name: `${localCmd.name} ${localGroup.name} ${localSub.name}`,
                  },
            localizations: sanitizeLocalizations(
              localSub.descriptionLocalizations,
            ),
            aliases: isMessageIgnored
              ? []
              : fullAliases.length
                ? fullAliases
                : undefined,
          });
        }
      }
    }
  }

  return parsedList;
}

function formatOptions(options: readonly any[]): string {
  return options
    .filter(
      (opt) =>
        opt.type !== ApplicationCommandOptionType.Subcommand &&
        opt.type !== ApplicationCommandOptionType.SubcommandGroup,
    )
    .map((opt) => {
      const typeName = optionTypes[opt.type] || "any";
      const formatted = `${opt.name}: ${typeName}`;
      return opt.required ? `<${formatted}>` : `[${formatted}]`;
    })
    .join(", ");
}