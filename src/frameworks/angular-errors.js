/**
 * Angular's own errors are written for someone with a stack trace and the source open. A report is read without either, so the
 * ones a fixture is likely to hit get a plain sentence that keeps Angular's code and the name it reports. Anything else passes through.
 * @param {string} text The first line of an error.
 * @returns {string}
 */
export function explainAngularError(text) {
  const code = /\bNG0*(\d+)\b/.exec(text)?.[1];
  if (!code) return text;
  const quoted = /`([^`]+)`|'([^']+)'|"([^"]+)"/.exec(text);
  const name = quoted?.[1] ?? quoted?.[2] ?? quoted?.[3];
  switch (code) {
    case "201":
    case "200":
      return `the fixture is missing a provider that the library needs${name ? ` (${name})` : ""}. Add it to the fixture's \`providers\` export, or put the part that provides it around this one (NG0${code})`;
    case "303":
    case "304":
    case "8002":
      return `the template uses an element or input that the library doesn't define${name ? ` (${name})` : ""}, or the component isn't in the template's imports (NG0${code})`;
    case "5105":
      return "the library animates with a legacy animations package that isn't installed in the fixture (NG05105)";
    case "908":
      return "Angular couldn't find the root element to start from (NG0908)";
    default:
      return text;
  }
}
