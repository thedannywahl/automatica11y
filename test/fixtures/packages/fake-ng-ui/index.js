// A small Angular library for tests, written the way Angular libraries are wired but with no build step: each class is defined by
// calling its decorator as a function, which is all the decorator syntax compiles to. Every archetype has a part or two.
import { ApplicationRef, Component, Directive, ElementRef, EnvironmentInjector, Injectable, createComponent, inject, signal } from "@angular/core";

const define = (decorator, metadata, type) => decorator(metadata)(type);

// ---- button and link: components that take over a native element, selected by an attribute ----
export class UiButton {}
define(Component, { selector: "button[uiButton]", template: "<ng-content />", host: { type: "button", class: "ui-button", style: "min-width:44px;min-height:44px" } }, UiButton);
export class UiLink {}
define(Component, { selector: "a[uiLink]", template: "<ng-content />", host: { class: "ui-link" } }, UiLink);

// ---- dialog: a service opens a component inside a host element that has the dialog role ----
export class UiDialog {
  appRef = inject(ApplicationRef);
  environment = inject(EnvironmentInjector);
  open(Content) {
    const host = document.createElement("div");
    host.setAttribute("role", "dialog");
    host.setAttribute("aria-modal", "true");
    host.setAttribute("aria-label", "Dialog");
    document.body.append(host);
    const ref = createComponent(Content, { environmentInjector: this.environment, hostElement: host });
    this.appRef.attachView(ref.hostView);
    return { close: () => { ref.destroy(); host.remove(); } };
  }
}
define(Injectable, { providedIn: "root" }, UiDialog);

// ---- menu: a trigger directive points at a menu component by template reference ----
export class UiMenu { isOpen = signal(false); }
define(Component, { selector: "ui-menu", exportAs: "uiMenu", template: "<ng-content />", host: { role: "menu", "[hidden]": "!isOpen()" } }, UiMenu);
export class UiMenuTrigger {
  uiMenuTriggerFor;
  toggle() { this.uiMenuTriggerFor.isOpen.update((open) => !open); }
  expanded() { return this.uiMenuTriggerFor?.isOpen() ? "true" : "false"; }
}
define(Directive, { selector: "[uiMenuTriggerFor]", inputs: ["uiMenuTriggerFor"], host: { "aria-haspopup": "menu", "[attr.aria-expanded]": "expanded()", "(click)": "toggle()" } }, UiMenuTrigger);
export class UiMenuItem {}
define(Directive, { selector: "[uiMenuItem]", host: { role: "menuitem", tabindex: "-1" } }, UiMenuItem);

// ---- tabs: attribute directives that set the roles ----
export class UiTabList {}
define(Directive, { selector: "[uiTabList]", host: { role: "tablist" } }, UiTabList);
export class UiTab {
  el = inject(ElementRef);
  select() { for (const tab of this.el.nativeElement.parentElement.querySelectorAll("[role=tab]")) tab.setAttribute("aria-selected", String(tab === this.el.nativeElement)); }
}
define(Directive, { selector: "[uiTab]", host: { role: "tab", "aria-selected": "false", "(click)": "select()" } }, UiTab);
export class UiTabPanel {}
define(Directive, { selector: "[uiTabPanel]", host: { role: "tabpanel" } }, UiTabPanel);

// ---- accordion: a trigger directive points at a panel directive by template reference ----
export class UiAccordionPanel { expanded = signal(false); }
define(Directive, { selector: "[uiAccordionPanel]", exportAs: "uiPanel", host: { role: "region", "aria-label": "Details", "[hidden]": "!expanded()" } }, UiAccordionPanel);
export class UiAccordionTrigger {
  uiAccordionTrigger;
  toggle() { this.uiAccordionTrigger.expanded.update((open) => !open); }
  expanded() { return this.uiAccordionTrigger?.expanded() ? "true" : "false"; }
}
define(Directive, { selector: "[uiAccordionTrigger]", inputs: ["uiAccordionTrigger"], host: { "[attr.aria-expanded]": "expanded()", "(click)": "toggle()" } }, UiAccordionTrigger);

// ---- combobox: an input directive points at a listbox component by template reference ----
export class UiListbox { isOpen = signal(false); }
define(Component, { selector: "ui-listbox", exportAs: "uiListbox", template: "<ng-content />", host: { role: "listbox", "[hidden]": "!isOpen()" } }, UiListbox);
export class UiCombobox {
  uiCombobox;
  open() { this.uiCombobox.isOpen.set(true); }
  expanded() { return this.uiCombobox?.isOpen() ? "true" : "false"; }
}
define(Directive, { selector: "[uiCombobox]", inputs: ["uiCombobox"], host: { role: "combobox", "[attr.aria-expanded]": "expanded()", "(keydown.arrowdown)": "open()" } }, UiCombobox);
export class UiOption {}
define(Directive, { selector: "[uiOption]", host: { role: "option" } }, UiOption);

// ---- form field: a wrapper component, a label directive, and an input directive ----
export class UiField {}
define(Component, { selector: "ui-field", template: "<ng-content />", host: { class: "ui-field" } }, UiField);
export class UiLabel {}
define(Directive, { selector: "label[uiLabel]", host: { class: "ui-label" } }, UiLabel);
export class UiInput {}
define(Directive, { selector: "input[uiInput]", host: { class: "ui-input", style: "min-height:44px" } }, UiInput);

// ---- tooltip: a directive that takes its text on the host element ----
export class UiTooltip {
  uiTooltip;
  tip = null;
  show() {
    this.tip = document.createElement("div");
    this.tip.setAttribute("role", "tooltip");
    this.tip.textContent = this.uiTooltip;
    document.body.append(this.tip);
  }
  hide() { this.tip?.remove(); this.tip = null; }
}
define(Directive, { selector: "[uiTooltip]", inputs: ["uiTooltip"], host: { "(focus)": "show()", "(blur)": "hide()" } }, UiTooltip);

// ---- live region: a message component with the alert role ----
export class UiAlert {}
define(Component, { selector: "ui-alert", template: "<ng-content />", host: { role: "alert" } }, UiAlert);

// A class that isn't an Angular class, so discovery has something to leave out.
export function helper() {}
export const VERSION = "1.0.0";
