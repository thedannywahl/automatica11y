import { cpSync, existsSync, mkdirSync, readFileSync, symlinkSync } from "node:fs";
import { join } from "node:path";

const packages = new URL("../fixtures/packages/", import.meta.url).pathname;
const repoModules = new URL("../../node_modules/", import.meta.url).pathname;

/** Registry metadata for the fake packages, as `npm view` would return it. */
export const REGISTRY = {
  "fake-ui": { name: "fake-ui", version: "1.0.0", peerDependencies: { react: "*", "react-dom": "*" } },
  "fake-nospread": { name: "fake-nospread", version: "1.0.0", peerDependencies: { react: "*", "react-dom": "*" } },
  "fake-wc": { name: "fake-wc", version: "1.0.0", customElements: "custom-elements.json" },
  "fake-compound": { name: "fake-compound", version: "1.0.0", peerDependencies: { react: "*", "react-dom": "*" } },
  "fake-controlled": { name: "fake-controlled", version: "1.0.0", peerDependencies: { react: "*", "react-dom": "*" } },
  "fake-nope": { name: "fake-nope", version: "1.0.0", peerDependencies: { react: "*", "react-dom": "*" } },
  "fake-wc-generate": { name: "fake-wc-generate", version: "1.0.0", customElements: "custom-elements.json" },
  "closed-wc": { name: "closed-wc", version: "2.0.0" },
  "quiet-wc": { name: "quiet-wc", version: "1.0.0" },
  "plain-utils": { name: "plain-utils", version: "3.0.0" },
  "vue-lib": { name: "vue-lib", version: "1.0.0", peerDependencies: { vue: "^3" } },
};

export const npmView = async (spec) => {
  const name = spec.replace(/@[^@/]*$/, "");
  const meta = REGISTRY[name];
  if (!meta) throw new Error(`"${spec}" wasn't found on npm.`);
  return meta;
};

/** Stand in for npm: copy the fake package into the install folder and link the repo's React. */
export async function installPackage({ dir, name, version, flavor }) {
  if (!REGISTRY[name]) throw new Error(`npm couldn't install ${name}@${version}: not found`);
  mkdirSync(join(dir, "node_modules"), { recursive: true });
  cpSync(join(packages, name), join(dir, "node_modules", name), { recursive: true });
  if (flavor === "react") {
    for (const dep of ["react", "react-dom", "scheduler"]) if (existsSync(join(repoModules, dep))) symlinkSync(join(repoModules, dep), join(dir, "node_modules", dep));
  }
  const react = flavor === "react" ? JSON.parse(readFileSync(join(repoModules, "react", "package.json"), "utf8")).version : null;
  return { dir, warnings: [], react, reactDom: react, version };
}

