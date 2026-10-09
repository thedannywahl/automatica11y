// This library keeps its components in sub-paths, and its main entry has none, like Angular Material.
import { Component } from "@angular/core";
export class SplitButton {}
Component({ selector: "button[splitButton]", template: "<ng-content />", host: { type: "button" } })(SplitButton);
