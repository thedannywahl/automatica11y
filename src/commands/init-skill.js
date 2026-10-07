import { EXIT } from "./common.js";

/** @param {string[]} _argv @param {import("./common.js").Io} io */
export async function initSkillCommand(_argv, io) {
  io.stderr.write("init-skill isn't built yet. It arrives in M8.\n");
  return EXIT.NOT_IMPLEMENTED;
}
