// A library whose parts look right to a generator and don't behave: the menu has no role, and the dialog service never opens anything.
import { Component, Directive, Injectable, signal } from "@angular/core";

export class WrongMenu { isOpen = signal(false); }
Component({ selector: "wrong-menu", exportAs: "wrongMenu", template: "<ng-content />", host: { "[hidden]": "!isOpen()" } })(WrongMenu);
export class WrongMenuTrigger {
  wrongMenuTriggerFor;
  toggle() { this.wrongMenuTriggerFor.isOpen.update((open) => !open); }
}
Directive({ selector: "[wrongMenuTriggerFor]", inputs: ["wrongMenuTriggerFor"], host: { "(click)": "toggle()" } })(WrongMenuTrigger);

export class WrongDialog { open() {} }
Injectable({ providedIn: "root" })(WrongDialog);
