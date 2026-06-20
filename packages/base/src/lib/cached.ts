import type { ParsedCommand } from "./parse.js";

export const cached = {
    commands: new Map<string, ParsedCommand>()
};