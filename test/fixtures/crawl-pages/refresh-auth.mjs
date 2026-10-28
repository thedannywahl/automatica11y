let attempts = 0;
const headers = { "X-Fixture-Auth": "expired" };

export default {
  contextOptions: { extraHTTPHeaders: headers },
  preNavigationHooks: [
    async ({ page }) => {
      if (++attempts > 1) headers["X-Fixture-Auth"] = "refreshed";
      await page.setExtraHTTPHeaders(headers);
    },
  ],
  async verifyPage(page) {
    if (!(await page.locator("h1").textContent())?.includes("Protected")) throw new Error("Login required");
  },
};
