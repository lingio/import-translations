const languages = {
  en: { rtl: false },
  sv: { rtl: false },
  es: { rtl: false },
  fr: { rtl: false },
  de: { rtl: false },
  it: { rtl: false },
  pt: { rtl: false },
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

export default function inject(contents, origTranslations) {
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

  const callsRegex = /translations\.([^.[]+)(\.([^.(]+)|\[[^\]]+\])/gm

  const keys = new Set()

  let match
  while ((match = callsRegex.exec(contents))) {
    let [_, key] = match
    keys.add(key)
  }

  function translation(key, languageId) {
    const entry = translations[languageId][key]

    if (!entry.text || !entry.text.trim()) {
      warnings.push(`Missing translation: ${key}.${languageId}`)
    }

    return entry
  }

  function translationsFor(key) {
    const ret = {}
    languageIds.forEach((languageId) => {
      ret[languageId] = translation(key, languageId)
    })
    return ret
  }

  // kill any existing translate functions. NOTE: This removes everything from translations to end-of-page
  contents = contents.replace(/\nconst translations = {(.|\n)*$/, ``)

  if (keys.size > 0) {
    const translations = {}
    for (const k of [...keys].sort()) {
      translations[k] = translationsFor(k)
    }
    contents = `${contents}\n\nconst translations = ${JSON.stringify(
      translations
    )}`
  }

  return {
    output: contents,
    warnings,
  }
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
