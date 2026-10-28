export default {
  contextOptions: { extraHTTPHeaders: { "X-Fixture-Auth": "fixture-only" } },
  async verifyPage(page) {
    if (!(await page.locator("h1").textContent())?.includes("Protected")) throw new Error("Not signed in");
  },
  async sitemapHeaders() {
    return { "X-Fixture-Auth": "fixture-only" };
  },
};
