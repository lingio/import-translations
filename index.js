#!/usr/bin/env node

import { writeFileSync, readFileSync, unlinkSync, realpathSync, existsSync } from "fs"
import { dirname } from "path"

import {
  getTranslations,
  getJavascriptFiles,
  getTranslationsFile,
} from "./translationsImporter.js"
import inject from "./translationsInjecter.js"

if (!process.env.TRANSLATIONS_URL) {
  console.error(`You must set the TRANSLATIONS_URL environment variable`)
  process.exit(1)
}

process.on('uncaughtException', function (err) {
  console.error(err.stack);
});

const [_bin, _file, targetRelative] = process.argv

if (!targetRelative) {
  console.log(process.argv)
  console.error(`Usage: import-translations <directory/file>`)
  process.exit(2)
}

let target
try {
  target = realpathSync(targetRelative)
} catch (e) {
  console.error(`Bad path: ${targetRelative}`)
  process.exit(3)
}

async function run() {
  let translations
  try {
    translations = await getTranslations()
  } catch (e) {
    console.error(`Failed to load translations.`, e)
    return
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

    // console.log(`Checking ${file}...`)
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
        unlinkSync(translationsFile)
      } catch (e) {
        // ignore issues removing the file
      }
    }
  }

  allWarnings.forEach((w) => {
    console.warn(w)
  })
}

run()
