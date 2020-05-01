export default function stringify(obj) {
  return (
    `Object.freeze(` +
    JSON.stringify(obj, null, 2)
      .replace(/"([a-zA-Z]+)":/g, "$1:")
      .replace(/"/g, `\``)
      .replace(/`([^`]+)`:/g, '"$1":')
      .replace(
        /\{\s+text: `([^`]+)`,\s+rtl: (true|false),\s+languageId: `([^`]+)`\s+\},?/gmu,
        `Object.freeze({ text: \`$1\`, rtl: $2, languageId: \`$3\` }),`
      ) +
    `)`
  )
}
