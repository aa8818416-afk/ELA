const { ESLint } = require("eslint");
const fs = require("fs");

(async function main() {
  try {
    const eslint = new ESLint();
    const results = await eslint.lintFiles(["src/**/*.ts", "src/**/*.tsx"]);
    const formatter = await eslint.loadFormatter("json");
    const resultText = formatter.format(results);
    fs.writeFileSync("eslint-results.json", resultText);
    console.log("Linting complete, results saved to eslint-results.json");
  } catch (err) {
    console.error(err);
  }
})();
