/**
 * Candidate Angular fixtures, built from what discovery read off each exported class: its kind, selectors, inputs, outputs,
 * `exportAs` names, and a service's methods. A selector says which element and attribute turn a class on, an input named
 * after a selector attribute (`matMenuTriggerFor`) points at another class, and `exportAs` says how a template names it.
 * Nothing here knows any one library. A candidate is a guess until the probe has seen it behave (see probe.js).
 */
import { markupFor } from "../../frameworks/angular-selectors.js";
import { score } from "../../plan/mapping.js";
import { ARCHETYPE_PATTERNS } from "../storybook.js";
import { markingSource } from "./marking.js";
import { ATTEMPT_LIMIT, GENERATABLE } from "./shared.js";

const words = (text) => String(text).replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/([A-Z])([A-Z][a-z])/g, "$1 $2").replace(/[-_[\]]/g, " ");

/** The shape of one record discovery wrote for a class. */
/** @typedef {{ name: string, angular: { kind: string, selectors?: unknown[][], inputs?: string[], outputs?: string[], exportAs?: string[], standalone?: boolean, moduleName?: string | null, methods?: string[] } }} Part */

const selectorText = (part) => (part.angular.selectors ?? []).flat().filter((x) => typeof x === "string").join(" ");

/** Does the class's name or selector say it belongs to this archetype? */
const fits = (archetype, part) => ARCHETYPE_PATTERNS[archetype].test(words(`${part.name} ${selectorText(part)}`));

/** The classes of a package that look like this archetype, plain Angular classes only, best fit first. */
function pool(archetype, exports) {
  return exports
    .filter((e) => e.angular && ["component", "directive", "service"].includes(e.angular.kind) && fits(archetype, e))
    .sort((a, b) => score(archetype, b.name) - score(archetype, a.name) || a.name.localeCompare(b.name));
}

/** Can a template use this class? A standalone one is imported by name, and another is imported through the module that declares it. */
const importName = (part) => (part.angular.kind === "service" || part.angular.standalone ? part.name : part.angular.moduleName ?? null);

const usable = (...parts) => parts.every((part) => part && importName(part));

/**
 * One element that turns a class on, as markup. `extra` holds attributes the recipe adds, and `bind` turns an attribute that is also
 * an input into a binding (`[matMenuTriggerFor]="m"`). `values` gives a text value to an attribute or input of that name.
 * @param {Part} part
 * @param {{ prefer?: string, fallback?: string, extra?: string[], bind?: Record<string, string>, values?: Record<string, string>, inner?: string }} [options]
 * @returns {string | null}
 */
function element(part, { prefer, fallback = "div", extra = [], bind = {}, values = {}, inner = "" } = {}) {
  // A selector that names its own element (`mat-tab`) can't be put on the preferred one, so it keeps its element.
  const markup = markupFor(part.angular.selectors, { prefer, fallback }) ?? markupFor(part.angular.selectors, { fallback });
  if (!markup) return null;
  const attrs = markup.attrs.map(([name, value]) => {
    if (name in bind) return `[${name}]="${bind[name]}"`;
    if (name in values) return `${name}="${values[name]}"`;
    return value ? `${name}="${value}"` : name;
  });
  for (const [name, value] of Object.entries(bind)) if (!markup.attrs.some(([attr]) => attr === name)) attrs.push(`[${name}]="${value}"`);
  for (const [name, value] of Object.entries(values)) if (!markup.attrs.some(([attr]) => attr === name)) attrs.push(`${name}="${value}"`);
  const open = [markup.tag, ...extra, ...attrs].join(" ");
  return VOID.has(markup.tag) ? `<${open}>` : `<${open}>${inner}</${markup.tag}>`;
}

const VOID = new Set(["input", "img", "br", "hr", "area", "base", "col", "embed", "link", "meta", "source", "track", "wbr"]);

const exportRef = (part) => part.angular.exportAs?.[0] ?? null;

/** The classes that can point at another (`[matMenuTriggerFor]`), with the input that does it, matched to classes that have an `exportAs`. */
function linked(archetype, exports, targetPattern) {
  const all = pool(archetype, exports);
  // The class that is pointed at needn't have the archetype's own name (a listbox for a combobox), so a name pattern widens it.
  const targets = [...new Set([...all, ...exports.filter((e) => e.angular && targetPattern.test(e.name))])].filter((e) => e.angular?.kind !== "service");
  const pairs = [];
  for (const pointer of all) {
    const inputs = pointer.angular.inputs ?? [];
    const attrs = new Set((pointer.angular.selectors ?? []).flat().filter((x) => typeof x === "string"));
    const input = inputs.find((name) => attrs.has(name) && /For$|^for$|Trigger|Target|Menu|Panel|Content|Overlay/.test(name)) ?? inputs.find((name) => /For$/.test(name)) ?? inputs.find((name) => attrs.has(name));
    if (!input) continue;
    // A library names its parts alike (`MatMenuTrigger`, `MatMenu`), so a target that starts the same way comes first and the rest are left out.
    const prefix = pointer.name.match(/^[A-Z][a-z0-9]*/)?.[0] ?? "";
    const near = targets.filter((target) => target.name.startsWith(prefix));
    for (const target of near.length ? near : targets) {
      if (target !== pointer && exportRef(target) && usable(pointer, target)) pairs.push({ pointer, target, input });
    }
  }
  return pairs;
}

const nameMatches = (parts, pattern) => parts.filter((part) => pattern.test(part.name));

/** The first text-like input of a class, such as `label` or `title`, so a recipe can fill it in. */
const textInput = (part, pattern = /^(label|title|header|heading|summary|text|value|name)$/) => (part.angular.inputs ?? []).find((name) => pattern.test(name)) ?? null;

/**
 * The source of one fixture. The marking code runs outside Angular's zone, so its polling doesn't trigger change detection.
 * @param {{ archetype: string, pkg: string, parts: Part[], template: string, fields?: string, before?: string, extraImports?: string[] }} input
 */
function fixture({ archetype, pkg, parts, template, fields = "", before = "", extraImports = [] }) {
  const names = [...new Set(parts.map(importName))].filter(Boolean);
  const imports = parts.filter((part) => part.angular.kind !== "service").map(importName);
  const core = ["Component", "NgZone", "inject", "signal", ...extraImports];
  return `import { ${[...new Set(core)].join(", ")} } from "@angular/core";
import { ${names.join(", ")} } from ${JSON.stringify(pkg)};

${markingSource(archetype)}${before}
class Fixture {
  zone = inject(NgZone);
${fields ? `${fields}\n` : ""}  constructor() {
    this.zone.runOutsideAngular(() => startMarking());
  }
}
Component({ selector: "app-fixture", imports: [${[...new Set(imports)].join(", ")}], template: ${JSON.stringify(template)} })(Fixture);
export default Fixture;
`;
}

const candidate = (id, summary, parts, source) => ({ id, summary, source, used: [...new Set(parts.map((part) => part.name))] });

const ITEMS = "[{ label: 'One', value: 'one', title: 'One', header: 'One', text: 'One', id: 'one', key: 'one', content: 'First panel.' }, { label: 'Two', value: 'two', title: 'Two', header: 'Two', text: 'Two', id: 'two', key: 'two', content: 'Second panel.' }]";
const itemsInput = (part) => (part.angular.inputs ?? []).find((name) => /^(items|tabs|options|panels|model|data|links)$/.test(name)) ?? null;

// ---- tooltip ----

function tooltips(pkg, exports) {
  const out = [];
  for (const part of pool("tooltip", exports).filter((p) => p.angular.kind !== "service" && usable(p))) {
    const attrs = new Set((part.angular.selectors ?? []).flat().filter((x) => typeof x === "string"));
    const input = (part.angular.inputs ?? []).find((name) => attrs.has(name)) ?? (part.angular.inputs ?? []).find((name) => /^(tip|tooltip|content|text|label|message|description)$/i.test(name) || /tooltip$/i.test(name));
    if (!input) continue;
    const host = element(part, { prefer: "button", extra: ['type="button"', "data-a11y-trigger"], values: { [input]: "Saves your work." }, inner: "Save" });
    if (host) out.push(candidate(`tooltip-${input}`, `a button with ${part.name} and its ${input} text`, [part], fixture({ archetype: "tooltip", pkg, parts: [part], template: host })));
  }
  return out;
}

// ---- live region ----

function messages(pkg, exports) {
  const out = [];
  const all = pool("live-region", exports);
  for (const part of all.filter((p) => p.angular.kind !== "service" && usable(p))) {
    const shownBy = (part.angular.inputs ?? []).find((name) => /^(open|opened|visible|show|shown|isOpen|display)$/.test(name));
    const message = element(part, { extra: [], inner: "Saved." });
    if (!message) continue;
    out.push(candidate(`message-if-${part.name}`, `${part.name} added when the trigger is pressed`, [part], fixture({
      archetype: "live-region", pkg, parts: [part], fields: "  shown = signal(false);",
      template: `<button type="button" data-a11y-trigger (click)="shown.set(true)">Show message</button>@if (shown()) {${message}}`,
    })));
    if (shownBy) {
      const flagged = element(part, { bind: { [shownBy]: "shown()" }, inner: "Saved." });
      out.push(candidate(`message-input-${part.name}`, `${part.name} shown through its ${shownBy} input`, [part], fixture({
        archetype: "live-region", pkg, parts: [part], fields: "  shown = signal(false);",
        template: `<button type="button" data-a11y-trigger (click)="shown.set(true)">Show message</button>${flagged}`,
      })));
    }
  }
  for (const service of all.filter((p) => p.angular.kind === "service")) {
    const method = (service.angular.methods ?? []).find((name) => /^(open|show|notify|add|success|info|error|warn|message|announce)/i.test(name));
    if (!method) continue;
    out.push(candidate(`message-service-${service.name}`, `${service.name}.${method}() called when the trigger is pressed`, [service], fixture({
      archetype: "live-region", pkg, parts: [service], fields: `  service = inject(${service.name});`,
      template: `<button type="button" data-a11y-trigger (click)="service.${method}('Saved.')">Show message</button>`,
    })));
  }
  return out;
}

// ---- form field ----

function fields(pkg, exports) {
  const out = [];
  const all = pool("form-field", exports).filter((p) => p.angular.kind !== "service" && usable(p));
  const wrappers = all.filter((p) => /Field|Form|Group|Wrapper|Control/.test(p.name) && !/Label|Input|Error|Hint/.test(p.name.replace(/(Form|Input)Field/, "")));
  const labels = nameMatches(all, /Label/);
  const inputs = all.filter((p) => /Input|Control|TextField|Textarea|Native|Field/.test(p.name) && !/Label|Error|Hint|Prefix|Suffix/.test(p.name));
  for (const input of inputs.slice(0, 3)) {
    const field = element(input, { prefer: "input", extra: ['id="name"', "data-a11y-trigger"] });
    if (!field) continue;
    const label = '<label for="name">Name</label>';
    for (const wrapper of wrappers.filter((w) => w !== input).slice(0, 2)) {
      const labelPart = labels.find((l) => l !== wrapper);
      const labelText = labelPart && usable(labelPart) ? element(labelPart, { prefer: "label", extra: ['for="name"'], inner: "Name" }) : label;
      const wrapped = element(wrapper, { inner: `${labelText ?? label}${field}` });
      if (wrapped) out.push(candidate(`field-wrapper-${wrapper.name}`, `${wrapper.name} around a label and ${input.name}`, [wrapper, input, ...(labelPart ? [labelPart] : [])], fixture({ archetype: "form-field", pkg, parts: [wrapper, input, ...(labelPart && usable(labelPart) ? [labelPart] : [])], template: wrapped })));
    }
    out.push(candidate(`field-bare-${input.name}`, `${input.name} on a native input with its own label`, [input], fixture({ archetype: "form-field", pkg, parts: [input], template: `${label}${field}` })));
  }
  for (const part of all.filter((p) => p.angular.kind === "component" && (p.angular.inputs ?? []).some((name) => /^(label|placeholder|value)$/.test(name)))) {
    const labelInput = (part.angular.inputs ?? []).find((name) => name === "label");
    const self = element(part, { prefer: "div", extra: ["data-a11y-trigger"], values: labelInput ? { label: "Name" } : {} });
    if (self) out.push(candidate(`field-component-${part.name}`, `${part.name} as the whole field`, [part], fixture({ archetype: "form-field", pkg, parts: [part], template: self })));
  }
  return out;
}

// ---- tabs and accordion: a group with child parts, or a data-driven component ----

function groups(archetype, pkg, exports, { groupPattern, childPattern, childTag }) {
  const out = [];
  const all = pool(archetype, exports).filter((p) => p.angular.kind !== "service" && usable(p));
  const containers = all.filter((p) => groupPattern.test(p.name));
  const plain = (p) => p.angular && p.angular.kind !== "service" && usable(p) && childPattern.test(p.name) && !groupPattern.test(p.name);
  // A child needn't have the archetype's own name (`MatExpansionPanel`), so a part named like its container (`Mat…`) counts too.
  const near = (container) => exports.filter((p) => plain(p) && p.name.startsWith(container.name.match(/^[A-Z][a-z0-9]*/)?.[0] ?? "\0"));
  // The plainest child comes first: `MatTab` before `MatTabLabel`, which only works inside the other.
  const byLength = (a, b) => a.name.length - b.name.length;
  const headerFor = (child) => archetype !== "accordion" ? null : exports.find((p) => p.angular && usable(p) && /Header$/.test(p.name) && p.name.startsWith(child.name));
  const panel = (child, text, header) => {
    const labelInput = textInput(child);
    const headerMarkup = header ? element(header, { prefer: "div", inner: text }) : null;
    return element(child, { prefer: childTag, extra: childTag === "button" ? ['type="button"'] : [], values: labelInput && !headerMarkup ? { [labelInput]: text } : {}, inner: headerMarkup ? `${headerMarkup}${text} content.` : labelInput ? `${text} content.` : text });
  };
  const seenChildren = new Set();
  for (const container of containers.slice(0, 2)) {
    const children = [...new Set([...all.filter(plain), ...near(container)])].sort(byLength);
    for (const child of children.slice(0, 2)) {
      const header = headerFor(child);
      const one = panel(child, "One", header);
      const two = panel(child, "Two", header);
      const wrapped = one && two && element(container, { inner: `${one}${two}` });
      if (wrapped) out.push(candidate(`${archetype}-group-${container.name}-${child.name}`, `${container.name} holding two ${child.name}`, [container, child, ...(header ? [header] : [])], fixture({ archetype, pkg, parts: [container, child, ...(header ? [header] : [])], template: wrapped })));
      seenChildren.add(child);
    }
  }
  if (archetype === "accordion") {
    // A single disclosure panel, with no container around it.
    for (const child of [...new Set([...all.filter(plain), ...containers.flatMap(near)])].sort(byLength).slice(0, 2)) {
      const header = headerFor(child);
      const alone = panel(child, "Details", header);
      if (alone) out.push(candidate(`${archetype}-single-${child.name}`, `${child.name} on its own`, [child, ...(header ? [header] : [])], fixture({ archetype, pkg, parts: [child, ...(header ? [header] : [])], template: alone })));
    }
  }
  for (const part of all.filter((p) => itemsInput(p))) {
    const input = itemsInput(part);
    const host = element(part, { bind: { [input]: "items" } });
    if (host) out.push(candidate(`${archetype}-items-${part.name}`, `${part.name} given its ${input} input`, [part], fixture({ archetype, pkg, parts: [part], fields: `  items = ${ITEMS};`, template: host })));
  }
  return out;
}

const tabs = (pkg, exports) => groups("tabs", pkg, exports, { groupPattern: /(Tabs|TabGroup|TabList|TabNav|TabNavBar|TabBar|TabView)$|^Tab(s|List|Group|Nav|Bar)$/, childPattern: /Tab(Link|Item|Label|Panel)?$|Tab$/, childTag: "button" });

function accordions(pkg, exports) {
  const out = groups("accordion", pkg, exports, { groupPattern: /(Accordion|Expansion|Collapse|Collapsible)s?$/, childPattern: /(Panel|Item|Section|Tab|Disclosure)$/, childTag: "div" });
  for (const { pointer, target, input } of linked("accordion", exports, /Panel|Content|Collaps/)) {
    const ref = "panel";
    const trigger = element(pointer, { prefer: "button", extra: ['type="button"', "data-a11y-trigger"], bind: { [input]: ref }, inner: "Details" });
    const body = element(target, { extra: [`#${ref}="${exportRef(target)}"`], inner: "More about this." });
    if (trigger && body) out.push(candidate(`accordion-ref-${pointer.name}-${target.name}`, `${pointer.name} pointing at ${target.name}`, [pointer, target], fixture({ archetype: "accordion", pkg, parts: [pointer, target], template: `${trigger}${body}` })));
  }
  return out;
}

// ---- menu and combobox: a pointer directive and a panel it points at, with item parts ----

function menus(pkg, exports) {
  const out = [];
  const items = exports.filter((p) => p.angular && /Menu.*Item|Item/.test(p.name) && fits("menu", p) && p.angular.kind !== "service" && usable(p));
  for (const { pointer, target, input } of linked("menu", exports, /Menu|Panel/)) {
    const trigger = element(pointer, { prefer: "button", extra: ['type="button"', "data-a11y-trigger"], bind: { [input]: "m" }, inner: "Actions" });
    for (const item of [items[0] ?? null]) {
      const entry = item ? element(item, { prefer: "button", extra: ['type="button"'], inner: "Copy" }) : '<button type="button">Copy</button>';
      const panel = element(target, { extra: [`#m="${exportRef(target)}"`], inner: entry ?? "" });
      if (trigger && panel) out.push(candidate(`menu-ref-${pointer.name}-${target.name}`, `${pointer.name} pointing at ${target.name}`, [pointer, target, ...(item ? [item] : [])], fixture({ archetype: "menu", pkg, parts: [pointer, target, ...(item ? [item] : [])], template: `${trigger}${panel}` })));
    }
  }
  for (const part of pool("menu", exports).filter((p) => p.angular.kind !== "service" && usable(p) && itemsInput(p))) {
    const input = itemsInput(part);
    const host = element(part, { bind: { [input]: "items" } });
    if (host) out.push(candidate(`menu-items-${part.name}`, `${part.name} given its ${input} input`, [part], fixture({ archetype: "menu", pkg, parts: [part], fields: `  items = ${ITEMS};`, template: host })));
  }
  return out;
}

function comboboxes(pkg, exports) {
  const out = [];
  const options = exports.filter((p) => p.angular && /Option/.test(p.name) && p.angular.kind !== "service" && usable(p));
  for (const { pointer, target, input } of linked("combobox", exports, /Listbox|Options|Panel|Autocomplete|Overlay|Popup/)) {
    const field = element(pointer, { prefer: "input", extra: ['type="text"', 'aria-label="Fruit"', "data-a11y-trigger"], bind: { [input]: "l" } });
    const option = options[0] ? element(options[0], { prefer: "div", inner: "Apple" }) : '<div role="option">Apple</div>';
    const panel = element(target, { extra: [`#l="${exportRef(target)}"`], inner: option ?? "" });
    const used = [pointer, target, ...(options[0] ? [options[0]] : [])];
    if (field && panel) out.push(candidate(`combobox-ref-${pointer.name}-${target.name}`, `${pointer.name} pointing at ${target.name}`, used, fixture({ archetype: "combobox", pkg, parts: used, template: `${field}${panel}` })));
  }
  for (const part of pool("combobox", exports).filter((p) => p.angular.kind === "component" && usable(p) && (p.angular.inputs ?? []).some((name) => /^(options|items|suggestions)$/.test(name)))) {
    const input = (part.angular.inputs ?? []).find((name) => /^(options|items|suggestions)$/.test(name));
    const host = element(part, { prefer: "div", bind: { [input]: "items" }, extra: ['aria-label="Fruit"'] });
    if (host) out.push(candidate(`combobox-items-${part.name}`, `${part.name} given its ${input} input`, [part], fixture({ archetype: "combobox", pkg, parts: [part], fields: `  items = ${ITEMS};`, template: host })));
  }
  return out;
}

// ---- dialog ----

const CONTENT = `Component({ selector: "app-dialog-content", template: '<h2>Edit profile</h2><p>Update your details.</p><button type="button">Close</button>' })(DialogContent);\n`;

function dialogs(pkg, exports) {
  const out = [];
  const all = pool("dialog", exports);
  for (const service of all.filter((p) => p.angular.kind === "service")) {
    const method = (service.angular.methods ?? []).find((name) => /^open/i.test(name));
    if (!method) continue;
    out.push(candidate(`dialog-service-${service.name}`, `${service.name}.${method}() with a small content component`, [service], fixture({
      archetype: "dialog", pkg, parts: [service], before: `class DialogContent {}\n${CONTENT}`, fields: `  dialog = inject(${service.name});\n  content = DialogContent;`,
      template: `<button type="button" data-a11y-trigger (click)="dialog.${method}(content)">Open dialog</button>`,
    })));
  }
  for (const part of all.filter((p) => p.angular.kind === "component" && usable(p))) {
    const shownBy = (part.angular.inputs ?? []).find((name) => /^(open|opened|visible|show|isOpen|display)$/.test(name));
    if (!shownBy) continue;
    const closers = (part.angular.outputs ?? []).filter((name) => /close|hide|Change$/.test(name)).map((name) => (/Change$/.test(name) ? `(${name})="shown.set($event === true)"` : `(${name})="shown.set(false)"`));
    const host = element(part, { extra: closers, bind: { [shownBy]: "shown()" }, inner: '<h2>Edit profile</h2><p>Update your details.</p><button type="button" (click)="shown.set(false)">Close</button>' });
    if (host) out.push(candidate(`dialog-input-${part.name}`, `${part.name} shown through its ${shownBy} input`, [part], fixture({ archetype: "dialog", pkg, parts: [part], fields: "  shown = signal(false);", template: `<button type="button" data-a11y-trigger (click)="shown.set(true)">Open dialog</button>${host}` })));
  }
  return out;
}

const BUILDERS = { dialog: dialogs, menu: menus, tooltip: tooltips, tabs, accordion: accordions, combobox: comboboxes, "form-field": fields, "live-region": messages };

/**
 * Candidates for an Angular package, from what discovery read off its classes.
 * @param {{ archetype: string, pkg: string, exports: Array<{ name: string, angular?: any }> }} input
 * @returns {{ candidates: Array<{ id: string, summary: string, source: string, used: string[] }>, reason: string | null }}
 */
export function generateAngular({ archetype, pkg, exports }) {
  if (!GENERATABLE.has(archetype)) return { candidates: [], reason: `Nothing is generated for the ${archetype} archetype.` };
  const found = BUILDERS[archetype](pkg, exports);
  const seen = new Set();
  const candidates = found.filter((c) => (seen.has(c.id) ? false : seen.add(c.id))).slice(0, ATTEMPT_LIMIT);
  return candidates.length
    ? { candidates, reason: null }
    : { candidates: [], reason: `No Angular class looks like the ${archetype} archetype and shows a way to wire one (a selector, an input, or a service method), so a fixture has to be written.` };
}
