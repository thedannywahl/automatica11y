import { registerHooks } from "node:module";
import * as hooks from "./trace-hooks.mjs";

registerHooks(hooks);
