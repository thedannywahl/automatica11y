import { runCommand } from "./common.js";

/** @param {string[]} argv @param {import("./common.js").Io} io */
export const compareCommand = (argv, io) => runCommand("compare", argv, io);
