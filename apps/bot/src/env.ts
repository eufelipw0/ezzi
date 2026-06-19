import { z } from "zod";
import { validateEnv } from "@lithium/src/index.js";

export const env = await validateEnv(z.looseObject({
    BOT_TOKEN: z.string("Discord Bot Token is required").min(1),
}));