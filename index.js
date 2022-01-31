#!/usr/bin/env node

import { writeFileSync, readFileSync, unlinkSync, realpathSync, existsSync } from "fs"
import { dirname } from "path"

import {
  getTranslations,
  getJavascriptFiles,
  getTranslationsFile,
} from "./translationsImporter.js"
import inject, { getAllTranslations } from "./translationsInjecter.js"

if (!process.env.TRANSLATIONS_URL) {
  console.error(`You must set the TRANSLATIONS_URL environment variable`)
  process.exit(1)
}

process.on('uncaughtException', function (err) {
  console.error(err.stack);
});

const [_bin, _file, targetRelative] = process.argv

if (!targetRelative) {
  console.error(`Usage: import-translations (<directory/file> | --export-all)`)
  process.exit(2)
}

let translations
try {
  translations = await getTranslations()
} catch (e) {
  console.error(`Failed to load translations.`, e)
  process.exit(2)
}

if (!translations) {
  console.error(`Failed to get translation data`)
  process.exit(3)
}

let allkeys = Object.keys(translations).map(lang => Object.keys(translations[lang])).reduce((pv, cv) => [...pv, ...cv], [])
let maxkeys = Object.keys(translations).map(lang => Object.keys(translations[lang]).length).reduce((pv, cv) => Math.max(pv, cv), 0)
let detectedLanguages = Object.keys(translations)

console.log(`Found ${maxkeys} translation keys`)
console.log(`Found ${detectedLanguages.length} languages: ${detectedLanguages}`)

if (targetRelative === '--export-all') {
  const by_language = getAllTranslations(translations)

  Object.keys(by_language).map(li => {
    const lang = by_language[li];
    Object.keys(lang).map(ki => {
      const key = lang[ki]
      console.log('key', key)

      lang[ki] = key.text
    })
  })

  const by_key = {}
  allkeys.forEach(k => {
    by_key[k] = {}
    detectedLanguages.forEach(l => {
      by_key[k][l] = by_language[l][k]
    })
  })

  const timestamp = (new Date()).toISOString()
  const comment = `Auto generated ${timestamp}`

  const json = JSON.stringify({comment, by_language, by_key}, null, 2)
  writeFileSync('all-translations.json', json, 'UTF-8')
  console.log('Wrote all-translations.json')

  const js = `// ${comment}\n\nexport const languages = ${JSON.stringify(by_language, null, 2)}\n\nexport const keys = ${JSON.stringify(by_key, null, 2)}\n\n`
  writeFileSync('all-translations.js', js, 'UTF-8')
  console.log('Wrote all-translations.js')

  process.exit(0)
}

let target
try {
  target = realpathSync(targetRelative)
} catch (e) {
  console.error(`Bad path: ${targetRelative}`)
  process.exit(3)
}

const ignoreMatch = /(node_modules)/

async function run(translations, target) {
  const allWarnings = []

  let lastFolder = null

  for (const file of getJavascriptFiles(target)) {
    if (ignoreMatch.test(file)) {
      continue
    }

    const folder = dirname(file)
    if (folder != lastFolder) {
      lastFolder = folder
      console.log(`Scanning ${folder}...`)
    }

    const translationsFile = await getTranslationsFile(file)
    const translationsFileRelative = translationsFile.slice(
      file.lastIndexOf(`/`) + 1
    )

    const contents = readFileSync(file, `utf-8`)
    const result = inject(contents, translations, translationsFileRelative)
    result.warnings.forEach((w) => {
      allWarnings.push(`${file}\t\t${w}`)
    })

    if (contents !== result.output) {
      console.log(`Writing ${file}...`)
      writeFileSync(file, result.output, `utf-8`)
    }

    if (result.hasContent) {
      let oldTranslationContent = ``
      if (existsSync(translationsFile)) {
        oldTranslationContent = readFileSync(translationsFile, `utf-8`)
      }

      if (result.translations != oldTranslationContent) {
        console.log(`Writing ${translationsFile}...`)
        writeFileSync(translationsFile, result.translations, `utf-8`)
      }
    } else {
      try {
        if (existsSync(translationsFile)) {
          unlinkSync(translationsFile)
        }
      } catch (e) {
        // ignore issues removing the file
      }
    }
  }

  allWarnings.forEach((w) => {
    console.warn(w)
  })
}

run(translations, target)
