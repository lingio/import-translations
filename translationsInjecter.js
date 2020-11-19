import stringify from "./stringify.js"

const languages = {
  en: { rtl: false },
  sv: { rtl: false },
  es: { rtl: false },
  fr: { rtl: false },
  ar: { rtl: true },
  fa: { rtl: true },
  "fa-AF": { rtl: true },
  so: { rtl: false },
  ti: { rtl: false },
  tr: { rtl: false },
  pl: { rtl: false },
  ru: { rtl: false },
  uk: { rtl: false },
  th: { rtl: false },
}

export default function inject(contents, origTranslations, translationsFile) {
  const warnings = []
  const languageIds = Object.keys(origTranslations)

  const proxies = []
  const translations = {}
  languageIds.forEach((id) => (translations[id] = {}))

  // insert rtl information
  for (const key of Object.keys(origTranslations.en)) {
    for (const languageId of languageIds) {
      const text = origTranslations[languageId][key] || ``
      const match = text.match(/^use\(([a-zA-Z-]+)\)$/)

      if (match) {
        proxies.push([languageId, key, match[1]])
      } else {
        translations[languageId][key] = {
          text,
          rtl: languages[languageId].rtl,
          languageId,
        }
      }
    }
  }

  // Proxy use(...) statements
  proxies.forEach(([languageId, key, toLanguageId]) => {
    translations[languageId][key] = translations[toLanguageId][key]
  })

  // prepare translations with arrays
  const arrays = {}
  for (const keyStr of Object.keys(translations.en)) {
    const match = keyStr.match(/(^[^[]+)\[([^\]]+)\]/)
    if (match) {
      const [_, key, argsStr] = match
      const args = argsStr
        .split(`,`)
        .map((it) => it.trim())
        .filter((it) => it)

      if (arrays[key] && arrays[key] !== args.length) {
        throw new Error(
          `The key '${key}' was used with arrays of length ${arrays[key]} as well as ${args.length}. Failed on looking at '${keyStr}'`
        )
      } else {
        arrays[key] = args.length
      }

      languageIds.forEach((languageId) => {
        let o = translations[languageId][key]

        if (!o) {
          o = translations[languageId][key] = {}
        }

        args.forEach((arg, index) => {
          if (index === args.length - 1) {
            o[arg] = translations[languageId][keyStr]
            delete translations[languageId][keyStr]
          } else {
            if (!o[arg]) {
              o[arg] = {}
            }
            o = o[arg]
          }
        })
        o = translations
      })
    }
  }

  const callsRegex = /translations\.([a-z][a-zA-Z_]*)(\.([^.(]+)|\[[^\]]+\])/gm

  const keys = new Set()

  let match
  while ((match = callsRegex.exec(contents))) {
    let [_, key] = match
    keys.add(key)
  }

  function findEmptyChild(entry) {
    for (const k in entry) {
      if (typeof entry[k] === `string`) {
        if (!entry[k]) {
          return true
        }
      } else {
        return findEmptyChild(entry[k])
      }
    }
  }

  function translation(key, languageId) {
    const entry = translations[languageId][key]

    const isLiteral = typeof entry.text === `string`
    const hasEmpty = isLiteral ? !entry.text : findEmptyChild(entry)

    if (hasEmpty) {
      warnings.push(`Missing translation: ${key}.${languageId}`)
    }

    return entry
  }

  function translationsFor(key) {
    const ret = {}
    if (!translations.en.hasOwnProperty(key)) {
      warnings.push(
        `The key '${key}' was requested, but there is no such row in the document`
      )
      languageIds.forEach((languageId) => {
        ret[languageId] = {
          languageId: `en`,
          rtl: false,
          text: `!!! no translation !!!]`,
        }
      })
    } else {
      languageIds.forEach((languageId) => {
        ret[languageId] = translation(key, languageId)
      })
    }
    return ret
  }

  // kill any existing translate functions. NOTE: This removes everything from translations to end-of-page
  contents = contents.replace(/\nconst translations = {(.|\n)*$/, ``)

  // kill any existing translate imports.
  contents = contents.replace(
    /import translations from "\.\/.*\.translations.js"\n/,
    ``
  )

  const injectAvailable = keys.has(`availableLanguages`)
  keys.delete(`availableLanguages`)

  const hasContent = keys.size > 0 || injectAvailable
  const t = {}

  if (hasContent) {
    for (const k of [...keys].sort()) {
      t[k] = translationsFor(k)
    }

    if (injectAvailable) {
      t.availableLanguages = Object.keys(languages)
    }

    contents = `import translations from "./${translationsFile}"\n${contents}`
  }

  return {
    output: contents,
    translations: `// prettier-ignore\nexport default ${stringify(t)}`,
    warnings,
    hasContent,
  }
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
