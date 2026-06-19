import { createCommand } from "../index.js";

createCommand({
    name: "ping",
    description: "ping command",
    
    async run(int) {
        await int.reply("pong");
    }
})