/**
 * Candidate fixtures for JSX frameworks (React and Vue), built only from the part names a package exports.
 *
 * Each builder takes a function that makes a fresh kit (see kit.js), picks the parts it needs by common names, and returns
 * a candidate `{ id, summary, source, used }`, or null when the package doesn't have the parts. A candidate is a guess.
 * It only counts once the probe has bundled it, loaded it, and seen the trigger and root behave (see probe.js).
 *
 * The recipes follow how compound components are usually put together (a root, a trigger, a content part, and a title,
 * description, or close part), and how single components are usually switched on (an `open` prop and a close handler).
 * None of them names a library. What differs between frameworks is only how a fixture holds state, starts its marking code,
 * and spells a prop, so a dialect carries those three things (see dialects.js) and the recipes are shared.
 */

const indent = (text, spaces) => text.split("\n").map((line) => (line ? " ".repeat(spaces) + line : line)).join("\n");
/** A JSX element. Short text stays on one line, and anything longer goes on its own lines. */
const tag = (ref, props, children) => {
  if (!children) return `<${ref}${props} />`;
  return !children.includes("\n") && children.length < 40 && !children.startsWith("<") ? `<${ref}${props}>${children}</${ref}>` : `<${ref}${props}>\n${indent(children, 2)}\n</${ref}>`;
};

/** Wrap a layer in a portal and a positioner when the package has them. */
function layered(kit, content) {
  const positioner = kit.pick("positioner");
  const positioned = positioner ? tag(positioner, "", content) : content;
  const portal = kit.pick("portal");
  return portal ? tag(portal, "", positioned) : positioned;
}

// ---- dialog ----

function dialogContent(kit) {
  const title = kit.pick("title", "heading");
  const description = kit.pick("description", "desc", "contenttext");
  const close = kit.pick("close", "closebutton", "closetrigger", "dismiss");
  return [
    title ? tag(title, "", "Edit profile") : "<h2>Edit profile</h2>",
    description ? tag(description, "", "Update your details.") : "<p>Update your details.</p>",
    close ? tag(close, "", "Close") : '<button type="button">Close</button>',
  ].join("\n");
}

function dialogCompound(makeKit, pkg, d) {
  const kit = makeKit();
  const root = kit.pick("root") ?? kit.self;
  const trigger = kit.pick("trigger", "opener", "activator");
  const content = kit.pick("content", "popup", "window", "panel", "surface");
  if (!root || !trigger || !content) return null;
  const overlay = kit.pick("overlay", "backdrop");
  const layer = `${overlay ? `<${overlay} />\n` : ""}${tag(content, "", dialogContent(kit))}`;
  const body = tag(root, "", `${tag(trigger, " data-a11y-trigger", "Open dialog")}\n${layered(kit, layer)}`);
  return { id: "dialog-compound", summary: "a root, a trigger, and a content part that opens on its own", source: d.frame("dialog", pkg, body), used: kit.used() };
}

function dialogControlled([openProp, closeProp]) {
  return (makeKit, pkg, d) => {
    const kit = makeKit();
    const root = kit.pick("root") ?? kit.self;
    if (!root) return null;
    const content = kit.pick("content", "panel", "popup", "window", "surface");
    const inner = content ? tag(content, "", dialogContent(kit)) : dialogContent(kit);
    const overlay = kit.pick("overlay", "backdrop");
    const controls = ` ${d.attr(openProp, d.read("open"))} ${d.attr(closeProp, `(next) => ${d.write("open", "next === true")}`)}`;
    const body = `<>
  <button type="button" data-a11y-trigger onClick={() => ${d.write("open", "true")}}>Open dialog</button>
${indent(tag(root, controls, `${overlay ? `<${overlay} />\n` : ""}${inner}`), 2)}
</>`;
    return { id: `dialog-controlled-${openProp}-${closeProp}`.replace(/[^\w-]+/g, "-"), summary: `a root controlled with ${openProp} and ${closeProp}`, source: d.frame("dialog", pkg, body, `  ${d.declare("open", "false")}`), used: kit.used() };
  };
}

// ---- menu ----

/** How a menu item is written: bare, with a value, or rendered as a div (some libraries render items as a template by default). */
const MENU_ITEMS = [
  { id: "", summary: "", props: () => "" },
  { id: "-values", summary: " that have values", props: (name) => ` value="${name}"` },
  { id: "-as-div", summary: " rendered as divs", props: () => ' as="div"' },
];

function menu(variant) {
  return (makeKit, pkg, d) => {
    const kit = makeKit();
    const root = kit.pick("root") ?? kit.self;
    const trigger = kit.pick("trigger", "button", "opener");
    const content = kit.pick("content", "popup", "list", "items");
    const item = kit.pick("item", "menuitem", "option");
    if (!root || !trigger || !content || !item) return null;
    const items = [tag(item, variant.props("edit"), "Edit"), tag(item, variant.props("delete"), "Delete")].join("\n");
    const body = tag(root, "", `${tag(trigger, " data-a11y-trigger", "Open menu")}\n${layered(kit, tag(content, "", items))}`);
    return { id: `menu-compound${variant.id}`, summary: `a root, a trigger, and a content part with items${variant.summary}`, source: d.frame("menu", pkg, body), used: kit.used() };
  };
}

// ---- tooltip ----

function tooltipCompound(makeKit, pkg, d) {
  const kit = makeKit();
  const root = kit.pick("root") ?? kit.self;
  const trigger = kit.pick("trigger");
  const content = kit.pick("content", "popup", "bubble");
  if (!root || !trigger || !content) return null;
  const provider = kit.pick("provider");
  const inner = tag(root, "", `${tag(trigger, " data-a11y-trigger", "Save")}\n${layered(kit, tag(content, "", "Saves your work."))}`);
  const body = provider ? tag(provider, "", inner) : inner;
  return { id: "tooltip-compound", summary: "a root, a trigger, and a content part", source: d.frame("tooltip", pkg, body), used: kit.used() };
}

const tooltipSingle = (prop) => (makeKit, pkg, d) => {
  const kit = makeKit();
  if (!kit.self) return null;
  const body = `<${kit.self} ${prop}="Saves your work.">\n  <button type="button" data-a11y-trigger>Save</button>\n</${kit.self}>`;
  return { id: `tooltip-single-${prop}`, summary: `one component that wraps the trigger and takes ${prop}`, source: d.frame("tooltip", pkg, body), used: [kit.base] };
};

// ---- tabs ----

const TAB_VARIANTS = [
  { id: "value", rootProps: ' defaultValue="one"', item: (v) => ` value="${v}"`, summary: "tabs matched to panels by value" },
  { id: "index", rootProps: "", item: () => "", summary: "tabs matched to panels by position" },
  { id: "default-index", rootProps: " defaultIndex={0}", item: () => "", summary: "tabs matched by position, starting at index 0" },
];

const tabs = (variant) => (makeKit, pkg, d) => {
  const kit = makeKit();
  const root = kit.pick("root") ?? kit.self;
  const tab = kit.pick("trigger", "tab");
  const panel = kit.pick("content", "panel", "tabpanel");
  if (!root || !tab || !panel) return null;
  const list = kit.pick("list", "tablist", "tabs");
  const tabsMarkup = `${tag(tab, `${variant.item("one")} data-a11y-trigger`, "One")}\n${tag(tab, variant.item("two"), "Two")}`;
  const body = tag(root, variant.rootProps, `${list ? tag(list, "", tabsMarkup) : tabsMarkup}\n${tag(panel, variant.item("one"), "First panel")}\n${tag(panel, variant.item("two"), "Second panel")}`);
  return { id: `tabs-${variant.id}`, summary: variant.summary, source: d.frame("tabs", pkg, body), used: kit.used() };
};

// ---- accordion ----

const ACCORDION_ROOTS = [["", "no root props"], [' type="single" collapsible', "single, collapsible"], [" collapsible", "collapsible"], [" multiple", "multiple"]];

const accordion = ([rootProps, label]) => (makeKit, pkg, d) => {
  const kit = makeKit();
  const root = kit.pick("root") ?? kit.self;
  const item = kit.pick("item");
  const trigger = kit.pick("trigger", "button", "summary");
  const content = kit.pick("content", "panel", "itempanel", "body");
  if (!root || !trigger || !content) return null;
  const header = kit.pick("header", "itemheader", "heading");
  const section = (name) => {
    const button = tag(trigger, name === "one" ? " data-a11y-trigger" : "", `Section ${name}`);
    return `${header ? tag(header, "", button) : button}\n${tag(content, "", "More information.")}`;
  };
  // Some libraries have no item part: a disclosure is just a root with a button and a panel.
  if (!item) {
    if (rootProps) return null;
    return { id: "accordion-disclosure", summary: "a root with a button and a panel", source: d.frame("accordion", pkg, tag(root, "", section("one"))), used: kit.used() };
  }
  const one = (name, value) => tag(item, ` value="${value}"`, section(name));
  const body = tag(root, rootProps, `${one("one", "one")}\n${one("two", "two")}`);
  return { id: `accordion-${label.replace(/[^a-z]+/g, "-")}`, summary: `an accordion with ${label}`, source: d.frame("accordion", pkg, body), used: kit.used() };
};

// ---- combobox ----

const combobox = (itemProps) => (makeKit, pkg, d) => {
  const kit = makeKit();
  const root = kit.pick("root") ?? kit.self;
  const input = kit.pick("input", "control");
  const content = kit.pick("content", "list", "popup", "listbox");
  const item = kit.pick("item", "option");
  if (!root || !input || !content || !item) return null;
  const items = [tag(item, itemProps ? ' value="apple"' : "", "Apple"), tag(item, itemProps ? ' value="banana"' : "", "Banana")].join("\n");
  const body = tag(root, "", `${tag(input, ' data-a11y-trigger aria-label="Fruit"', "")}\n${layered(kit, tag(content, "", items))}`);
  return { id: `combobox-compound${itemProps ? "-values" : ""}`, summary: `a root, an input, and a list of options${itemProps ? " that have values" : ""}`, source: d.frame("combobox", pkg, body), used: kit.used() };
};

// ---- form field ----

function fieldCompound(makeKit, pkg, d) {
  const kit = makeKit();
  const root = kit.pick("root", "field");
  const label = kit.pick("label");
  const input = kit.pick("input", "control");
  if (!root || !label || !input) return null;
  const body = tag(root, "", `${tag(label, "", "Name")}\n${tag(input, " data-a11y-trigger", "")}`);
  return { id: "field-compound", summary: "a root, a label, and an input part", source: d.frame("form-field", pkg, body), used: kit.used() };
}

const fieldSingle = (id, summary, markup) => (makeKit, pkg, d) => {
  const kit = makeKit();
  if (!kit.self) return null;
  return { id, summary, source: d.frame("form-field", pkg, markup(kit.self, d)), used: [kit.base] };
};

// ---- live region ----

const messageConditional = (makeKit, pkg, d) => {
  const kit = makeKit();
  if (!kit.self) return null;
  const body = `<div>\n  <button type="button" data-a11y-trigger onClick={() => ${d.write("on", "true")}}>Show message</button>\n  <div>{${d.read("on")} && <${kit.self}>Saved.</${kit.self}>}</div>\n</div>`;
  return { id: "message-mounted", summary: "a message that is mounted when the trigger is pressed", source: d.frame("live-region", pkg, body, `  ${d.declare("on", "false")}`), used: [kit.base] };
};

const messageControlled = (prop) => (makeKit, pkg, d) => {
  const kit = makeKit();
  if (!kit.self) return null;
  const body = `<div>\n  <button type="button" data-a11y-trigger onClick={() => ${d.write("on", "true")}}>Show message</button>\n  <${kit.self} ${d.attr(prop, d.read("on"))}>Saved.</${kit.self}>\n</div>`;
  return { id: `message-${prop}`, summary: `a message shown with its ${prop} prop`, source: d.frame("live-region", pkg, body, `  ${d.declare("on", "false")}`), used: [kit.base] };
};

/** The builders for each archetype, most likely first. */
export const buildRecipes = (d) => ({
  dialog: [dialogCompound, ...d.openProps.map(dialogControlled)],
  menu: MENU_ITEMS.map(menu),
  tooltip: [tooltipCompound, ...["title", "label", "content", "text", "tip"].map(tooltipSingle)],
  tabs: TAB_VARIANTS.map(tabs),
  accordion: ACCORDION_ROOTS.map(accordion),
  combobox: [combobox(true), combobox(false)],
  "form-field": [
    fieldCompound,
    fieldSingle("field-wrapped-label", "an input inside a wrapping label", (self) => `<label>\n  Name\n  <${self} data-a11y-trigger />\n</label>`),
    fieldSingle("field-label-prop", "an input that takes a label prop", (self) => `<${self} label="Name" data-a11y-trigger />`),
    fieldSingle("field-label-for", "an input matched to a label by id", (self, d) => `<div>\n  <label ${d.labelFor}="name-field">Name</label>\n  <${self} id="name-field" data-a11y-trigger />\n</div>`),
  ],
  "live-region": [messageConditional, ...["open", "isOpen", "visible", "show"].map(messageControlled)],
});
