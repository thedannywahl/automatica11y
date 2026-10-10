/// <reference path="../shims.d.ts" />

import DefaultTheme from "vitepress/theme";
import type { Theme } from "vitepress";
import "@pantoken/css/style.lean.css";
import "@pantoken/plugin-custom-theme-colors/custom-theme-colors.css";
import "@pantoken/components/fonts.css";
import "./custom.css";

export default {
  extends: DefaultTheme,
  enhanceApp() {
    if (typeof document !== "undefined") {
      document.documentElement.dataset.pantokenColor = "plum";
      const content = document.getElementById("VPContent");
      content?.setAttribute("tabindex", "-1");
      if (content?.classList.contains("is-home")) content.setAttribute("role", "main");
    }
  },
} satisfies Theme;