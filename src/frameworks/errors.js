import { explainAngularError } from "./angular-errors.js";
import { explainSvelteError } from "./svelte-errors.js";

/**
 * One place that turns a framework's own error into a plain sentence, for any framework. The codes and wording don't overlap,
 * so each explainer leaves what isn't its own alone.
 * @param {string} text The first line of an error.
 * @returns {string}
 */
export function explainFrameworkError(text) {
  return explainAngularError(explainSvelteError(text));
}
