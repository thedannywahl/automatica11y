/** Properties our init scripts and helpers put on the page's window. They only exist inside the browser. */
type A11yColor = number[];
type A11yBox = { x: number; y: number; width: number; height: number };
type A11yTextPart = { key: number; text: string; color: A11yColor | null; size: number; weight: string; backdrop: A11yColor | null; undetermined: string | null };
type A11yFocusPart = {
  outlineStyle: string;
  outlineWidth: string;
  outlineColor: string;
  boxShadow: string;
  borderTopStyle: string;
  borderTopColor: string;
  borderTopWidth: string;
  backgroundColor: string;
  color: string;
  textDecorationLine: string;
  rendered: boolean;
};
type A11yFocusSnapshot = { parts: Record<string, A11yFocusPart>; box: A11yBox };

interface A11yHelpers {
  uid(node: Node | null): number | null;
  queryDeep(selector: string): Element | null;
  queryAllDeep(selector: string): Element[];
  deepActive(): Element | null;
  within(root: Node | null, node: Node | null): boolean;
  visible(element: Element | null): boolean;
  snapshot(): {
    clicks: number;
    triggerTag: string | null;
    triggerRole: string | null;
    expanded: string | null;
    rootExists: boolean;
    rootVisible: boolean;
    rootModal: boolean;
    activeIsTrigger: boolean;
    activeInRoot: boolean;
    activeUid: number | null;
    activeTag: string | null;
    activeText: string;
    activeRole: string | null;
    bodyActive: boolean;
  };
  items(selector: string): Array<{ uid: number | null; text: string; active: boolean; selected: boolean; hasSelected: boolean; visible: boolean }>;
  live(): {
    ancestorUids: Array<number | null>;
    present: boolean;
    visible: boolean;
    text: string;
    named: boolean;
    region: { uid: number | null; role: string | null; ariaLive: string | null; politeness: string; isMessage: boolean } | null;
    regionUids: Array<number | null>;
  };
  focusDismiss(): { found: false } | { found: true; tag: string; label: string };
  nameSources(): string[] | null;
  errorInfo(): { invalid: boolean; ariaInvalid: boolean; linked: string[]; live: string[] } | null;
  focusSnapshot(): A11yFocusSnapshot | null;
  remember(): void;
  lastSnapshot(): A11yFocusSnapshot | null;
  inputValue(): string | null;
}

interface A11yMeasure {
  rgba(css: string): A11yColor | null;
  text(scope?: string): A11yTextPart[] | null;
  boundary(): {
    outside: A11yColor | null;
    undetermined: string | null;
    parts: Array<{ kind: string; color: A11yColor; width?: number }>;
    graphics: Array<{ kind: string; color: A11yColor }>;
    hasText: boolean;
    inputLike: boolean;
    box: A11yBox;
  } | null;
  focusStyles(atRest: boolean): {
    outside: A11yColor | null;
    inside: A11yColor | null;
    undetermined: string | null;
    outline: { width: number; offset: number; color: A11yColor | null } | null;
    shadows: Array<{ inset: boolean; x: number; y: number; blur: number; spread: number; color: A11yColor | null }>;
    border: { width: number; color: A11yColor } | null;
    box: A11yBox;
  } | null;
  compareShots(before: string, after: string): Promise<{ changed: number; strong: number; max: number; width: number; height: number }>;
}

interface A11yConditions {
  describe(element: Element | null): string;
  animations(): Array<{ kind: string; name: string; target: string; duration: number | null; iterations: number | "infinite"; props: string[]; moving: boolean }>;
  overflow(rootSelector?: string): {
    viewportWidth: number;
    scrollWidth: number;
    offenders: Array<{ element: string; right: number; width: number; left: number }>;
    offenderCount: number;
    root: { element: string; left: number; right: number } | null;
  };
  clipping(): Array<{ visuallyHidden: boolean; element: string; hidesX: boolean; hidesY: boolean; overX: number; overY: number; text: string }>;
  applySpacing(): void;
  translucentSurfaces(): Array<{ element: string; background: string; backdropFilter: string }>;
  forcedColorOptOuts(): string[];
  appearance(): { colorScheme: string; background: string; color: string };
}

interface PackageExport {
  name: string;
  type: string;
  parts: string[];
}

type AngularExportInfo =
  | { kind: "component" | "directive"; selectors: Array<Array<string | number>>; inputs: string[]; outputs: string[]; exportAs: string[]; standalone: boolean; moduleName?: string | null }
  | { kind: "module"; declares: string[]; exports: string[] }
  | { kind: "service"; methods: string[] }
  | { kind: "error"; message: string };

interface AngularPackageExport extends PackageExport {
  angular: AngularExportInfo;
}

interface Window {
  __a11y: A11yHelpers;
  __a11yMeasure: A11yMeasure;
  __a11yConditions: A11yConditions;
  __vsr: Pick<typeof import("@guidepup/virtual-screen-reader"), "Virtual" | "virtual">;
  __a11yClicks: number;
  __a11yLast: Element | null;
  __a11yExports?: Array<PackageExport | AngularPackageExport>;
  __a11yDefined?: string[];
  __a11yClosedShadowHosts?: string[];
}
