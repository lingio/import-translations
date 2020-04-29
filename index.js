#!/usr/bin/env node

import { writeFileSync, readFileSync, unlinkSync } from "fs"
import { exec } from "child_process"

import { getTranslations, getJavascriptFiles } from "./translationsImporter.js"
import inject from "./translationsInjecter.js"

if (!process.env.TRANSLATIONS_URL) {
  console.error(`You must set the TRANSLATIONS_URL environment variable`)
  process.exit(1)
}

async function run() {
  const translations = await getTranslations()
  const allWarnings = []

  for (const file of getJavascriptFiles(`.`)) {
    const translationsFile = file.replace(/\.js$/, `.translations.js`)
    const translationsFileRelative = translationsFile.slice(
      translationsFile.lastIndexOf(`/`) + 1
    )

    const contents = readFileSync(file, `utf-8`)
    const result = inject(contents, translations, translationsFileRelative)
    result.warnings.forEach((w) => {
      allWarnings.push(`${w}\t\t${file}`)
    })

    writeFileSync(file, result.output, `utf-8`)

    if (result.hasContent) {
      writeFileSync(translationsFile, result.translations, `utf-8`)
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
