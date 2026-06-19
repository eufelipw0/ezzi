import { bootstrap } from "@lithium/src/index.js";
import { env } from './env.js';

await bootstrap({ meta: import.meta, env })