#!/usr/bin/env node

import { writeFileSync, readFileSync } from "fs"
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
    const contents = readFileSync(file, `utf-8`)
    const { output, warnings } = inject(contents, translations)
    warnings.forEach((w) => {
      allWarnings.push(`${w}\t\t${file}`)
    })

    if (output !== contents) {
      writeFileSync(file, output, `utf-8`)

      await new Promise((res) => {
        exec(`prettier --write '${file}'`, res)
      })
    }
  }

  allWarnings.forEach((w) => {
    console.warn(w)
  })
}

run()
