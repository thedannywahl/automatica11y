/**
 * Candidate web component fixtures, built from what the element says about itself once it's defined:
 * the attributes it observes, the members its class has, and the slots its shadow root offers.
 * A candidate is a guess until the probe has seen it behave (see probe.js). None of this names a library.
 */
import { markingSource } from "./marking.js";
import { ATTEMPT_LIMIT, GENERATABLE } from "./shared.js";

/** The module around every candidate: the marking code and a mount function that starts it. */
function frame(archetype, body) {
  return `${markingSource(archetype)}
export default function mount(container) {
${body.split("\n").map((line) => (line ? `  ${line}` : line)).join("\n")}
  startMarking();
}
`;
}

const has = (facts, name) => facts.attributes.includes(name) || facts.members.includes(name);
const slotFor = (facts, pattern) => facts.slots.find((name) => pattern.test(name));

// ---- dialog ----

/** The ways a dialog element is commonly opened, from what it has. */
function openers(facts) {
  const found = [];
  if (facts.attributes.includes("open")) found.push(["attribute", `dialog.setAttribute("open", "");`]);
  if (facts.members.includes("open")) found.push(["property", "dialog.open = true;"]);
  if (facts.members.includes("showModal")) found.push(["showModal()", "dialog.showModal();"]);
  if (facts.members.includes("show")) found.push(["show()", "dialog.show();"]);
  return found;
}

function dialogs(tagName, facts) {
  const titleSlot = slotFor(facts, /title|header|heading/i);
  const heading = titleSlot ? `<h2 slot="${titleSlot}">Edit profile</h2>` : "<h2>Edit profile</h2>";
  return openers(facts).map(([how, code]) => ({
    id: `dialog-${how.replace(/[^a-z]+/gi, "-").replace(/-$/, "")}`,
    summary: `a ${tagName} opened with its ${how}`,
    source: frame("dialog", `container.innerHTML = \`<button type="button" data-a11y-trigger>Open dialog</button><${tagName}>${heading}<p>Update your details.</p><button type="button">Close</button></${tagName}>\`;
const dialog = container.querySelector(${JSON.stringify(tagName)});
container.querySelector("[data-a11y-trigger]").addEventListener("click", () => {
  ${code}
});`),
    used: [tagName],
  }));
}

// ---- tooltip ----

function tooltips(tagName, facts) {
  return facts.attributes.filter((name) => /^(tip|tooltip|content|text|label|title|message|description)$/.test(name)).map((name) => ({
    id: `tooltip-${name}`,
    summary: `a ${tagName} that takes its text from ${name}`,
    source: frame("tooltip", `container.innerHTML = \`<${tagName} ${name}="Saves your work."><button type="button" data-a11y-trigger>Save</button></${tagName}>\`;`),
    used: [tagName],
  }));
}

// ---- live region ----

function messages(tagName, facts) {
  const list = [{
    id: "message-appended",
    summary: `a ${tagName} added to the page when the trigger is pressed`,
    source: frame("live-region", `container.innerHTML = \`<button type="button" data-a11y-trigger>Show message</button><div id="slot"></div>\`;
container.querySelector("[data-a11y-trigger]").addEventListener("click", () => {
  const message = document.createElement(${JSON.stringify(tagName)});
  message.textContent = "Saved.";
  container.querySelector("#slot").append(message);
});`),
    used: [tagName],
  }];
  if (has(facts, "open")) {
    list.push({
      id: "message-open",
      summary: `a ${tagName} shown by setting open`,
      source: frame("live-region", `container.innerHTML = \`<button type="button" data-a11y-trigger>Show message</button><${tagName}>Saved.</${tagName}>\`;
const message = container.querySelector(${JSON.stringify(tagName)});
container.querySelector("[data-a11y-trigger]").addEventListener("click", () => message.setAttribute("open", ""));`),
      used: [tagName],
    });
  }
  return list;
}

// ---- form field ----

/** The element isn't marked as the trigger here. The marking code finds the input inside its shadow root, which is the thing a person types in. */
function fields(tagName, facts) {
  if (!["value", "name", "label", "placeholder", "checked", "type"].some((name) => has(facts, name))) return [];
  const list = [{
    id: "field-wrapped-label",
    summary: `a ${tagName} inside a wrapping label`,
    source: frame("form-field", `container.innerHTML = \`<label>Name <${tagName}></${tagName}></label>\`;`),
    used: [tagName],
  }];
  if (has(facts, "label")) {
    list.push({
      id: "field-label-attribute",
      summary: `a ${tagName} with a label attribute`,
      source: frame("form-field", `container.innerHTML = \`<${tagName} label="Name"></${tagName}>\`;`),
      used: [tagName],
    });
  }
  return list;
}

/**
 * Candidates for one element and archetype. Archetypes with no recipe here (menu, tabs, accordion, combobox) return none,
 * because those depend on child elements and slots that an element can't describe well enough to guess.
 * @param {{ archetype: string, tag: string, facts: { attributes: string[], members: string[], slots: string[] } }} input
 */
export function wcCandidates({ archetype, tag, facts }) {
  const build = { dialog: dialogs, tooltip: tooltips, "live-region": messages, "form-field": fields }[archetype];
  return build ? build(tag, facts) : [];
}

/**
 * Candidates for a web component package, from what the element the mapping found says about itself.
 * @param {{ archetype: string, entry: { tag?: string }, facts: Record<string, { attributes: string[], members: string[], slots: string[] }> }} input
 * @returns {{ candidates: Array<{ id: string, summary: string, source: string, used: string[] }>, reason: string | null }}
 */
export function generateWc({ archetype, entry, facts }) {
  if (!GENERATABLE.has(archetype)) return { candidates: [], reason: `Nothing is generated for the ${archetype} archetype.` };
  const tag = entry.tag;
  if (!tag || !facts[tag]) return { candidates: [], reason: "No custom element looks like this archetype, so there's nothing to build a fixture around." };
  const candidates = wcCandidates({ archetype, tag, facts: facts[tag] }).slice(0, ATTEMPT_LIMIT);
  return candidates.length
    ? { candidates, reason: null }
    : { candidates: [], reason: `${tag} doesn't show a way to wire a ${archetype} (for example, an open attribute or a tip attribute), and no recipe covers a web component ${archetype} without one.` };
}
