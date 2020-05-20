const processLine = (input) => input
  .replace(/"([a-zA-Z]+)":/g, `$1:`) // remove quotes on keys
  .replace(/"(.*)"/g, `\`$1\``) // replace outermost double quotes with backticks

export default function stringify(obj) {
  return (
    `Object.freeze(` +
    JSON.stringify(obj, null, 2)
      .split('\n')
      .map(r => processLine(r))
      .join('\n')
      .replace(
        /\{\s+text: `([^`]+)`,\s+rtl: (true|false),\s+languageId: `([^`]+)`\s+\},?/gmu,
        `Object.freeze({ text: \`$1\`, rtl: $2, languageId: \`$3\` }),`
      ) // flatten keys into one line
      +
    `)`
  )
}
