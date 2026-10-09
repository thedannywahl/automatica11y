/**
 * Svelte's own errors point at its source and its docs. A report is read without either, so the ones a fixture is likely to hit
 * get a plain sentence. Anything else passes through.
 * @param {string} text The first line of an error.
 * @returns {string}
 */
export function explainSvelteError(text) {
  // A library written for SvelteKit imports modules that only exist inside a SvelteKit app.
  const kit = /Could not resolve "(\$(?:app|env|lib|service-worker)(?:\/[^"]*)?)"/.exec(text);
  if (kit) return `the library imports ${kit[1]}, which only exists inside a SvelteKit app, so it can't run on its own (${text.split(" (")[0].replace(/^Bundling failed: /, "")})`;
  const code = /svelte\.dev\/e\/(\w+)/.exec(text)?.[1];
  const name = /["'`]([\w$.-]+)["'`]/.exec(text)?.[1];
  if (/missing_context|Context "?[^"]*"? not found|Could not find .*context|getContext\(\) .*undefined|Cannot read properties of undefined \(reading 'getContext'\)/i.test(text) || code === "missing_context") {
    return `a part of the library needs a context that its parent part provides${name ? ` (${name})` : ""}. Put it inside its root part${code ? ` (${code})` : ""}`;
  }
  if (code === "lifecycle_outside_component" || /can only be used during component initiali[sz]ation/i.test(text)) {
    return "the library called a lifecycle or context function outside a component, so it can't be mounted this way (lifecycle_outside_component)";
  }
  if (code === "props_invalid_value" || code === "invalid_default_snippet" || code === "snippet_without_render_tag") {
    return `a component got a value of the wrong kind for a prop${name ? ` (${name})` : ""}, such as content where it wanted a snippet (${code})`;
  }
  if (code === "bind_not_bindable" || code === "props_not_bindable") {
    return `the fixture binds a prop that the component doesn't allow to be bound${name ? ` (${name})` : ""} (${code})`;
  }
  // A namespace object (`Dialog`) used as a component is compiled to a call, and the call fails like this.
  if (/^TypeError: (\w*_)?exports\w* is not a function/.test(text)) {
    return `${text} (a namespace of parts, such as Dialog, was used as if it were one component)`;
  }
  return text;
}
