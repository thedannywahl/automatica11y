// An Angular library that groups its parts in a module, the older way: its button isn't standalone, so a template imports the module.
import { Component, NgModule } from "@angular/core";

export class LegacyButton {}
Component({ selector: "button[legacyButton]", standalone: false, template: "<ng-content />", host: { type: "button" } })(LegacyButton);
export class LegacyLink {}
Component({ selector: "a[legacyLink]", standalone: false, template: "<ng-content />" })(LegacyLink);
export class LegacyModule {}
NgModule({ declarations: [LegacyButton, LegacyLink], exports: [LegacyButton, LegacyLink] })(LegacyModule);
