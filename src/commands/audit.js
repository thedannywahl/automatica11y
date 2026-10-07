import { runCommand } from "./common.js";

/** @param {string[]} argv @param {import("./common.js").Io} io */
export const auditCommand = (argv, io) => runCommand("audit", argv, io);
