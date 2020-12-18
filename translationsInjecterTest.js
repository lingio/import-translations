// simple unit test for translations injecter, just run it with node v13 or later
// Using `supervisor -n exit translationsInjecterTest.js` is recommmended

import assert from "assert"
import inject from "./translationsInjecter.js"
import stringify from "./stringify.js"

try {
  const translations = {
    en: {
      simple: "Simple",
      "animal[duck]": "A duck",
      "animal[donkey]": "A donkey",
      "car[tesla,expensive]": "An expensive tesla car",
      earnedPoints: `You've earned {0} points!`,
      onlyEn: `This is English`,
      quoted: `This is a "quoted string"`,
      lackingEnglish: ``,
    },
    sv: {
      simple: "Enkelt",
      "animal[duck]": "En anka",
      "animal[donkey]": "En åsna",
      "car[tesla,expensive]": "En dyr tesla bil",
      earnedPoints: `Du har tjänat in {0} poäng!`,
      onlyEn: `use(en)`,
      quoted: `Den här strängen är "inkvoterad"`,
      lackingEnglish: `got Swedish though`,
    },
  }

  /* === TEST === */
  console.log("==== It should inject import tag and provide translations")
  let input = `translations.simple.en`
  let expected = `// prettier-ignore\nexport default ${stringify({
    simple: {
      en: { text: `Simple`, rtl: false, languageId: `en` },
      sv: { text: `Enkelt`, rtl: false, languageId: `sv` },
    },
  })}`

  assert.equal(inject(input, translations).translations, expected)
  assert.equal(
    inject(input, translations, `test.translations.js`).output,
    `import translations from "./test.translations.js"\ntranslations.simple.en`
  )

  /* === TEST === */
  console.log("==== It should not duplicate import statements")
  input = `import translations from "./test.translations.js"\nimport translations from "./test/translations.js"\n\ntranslations.simple.en`
  assert.equal(
    inject(input, translations, `test.translations.js`).output,
    `import translations from "./test.translations.js"\n\ntranslations.simple.en`
  )

  /* === TEST === */
  console.log("==== It should create new objects with params")
  input = `translations.animal.en.duck`
  expected = `// prettier-ignore\nexport default ${stringify({
    animal: {
      en: {
        duck: { text: `A duck`, rtl: false, languageId: `en` },
        donkey: { text: `A donkey`, rtl: false, languageId: `en` },
      },
      sv: {
        duck: { text: `En anka`, rtl: false, languageId: `sv` },
        donkey: { text: `En åsna`, rtl: false, languageId: `sv` },
      },
    },
  })}`

  assert.equal(inject(input, translations).translations, expected)

  /* === TEST === */
  console.log("==== It should use other language if specified with use(...)")
  input = `translations.onlyEn.sv`
  expected = `// prettier-ignore\nexport default ${stringify({
    onlyEn: {
      en: { text: `This is English`, rtl: false, languageId: `en` },
      sv: { text: `This is English`, rtl: false, languageId: `en` },
    },
  })}`

  assert.equal(inject(input, translations).translations, expected)

  /* === TEST === */
  console.log("==== It should warn about missing translations")
  assert.deepEqual(
    inject(`translations.lackingEnglish.en`, translations).warnings,
    [`Missing translation: lackingEnglish.en`]
  )

  /* === TEST === */
  console.log("==== It should NOT warn about missing UNUSED translations")
  assert.deepEqual(inject(`translations.simple.en`, translations).warnings, [])

  /* === TEST === */
  console.log("==== It should keep quotes in translated strings")
  input = `translations.quoted.en`
  expected = `// prettier-ignore
export default Object.freeze({
  quoted: {
    en: Object.freeze({ text: \`This is a \\"quoted string\\"\`, rtl: false, languageId: \`en\` }),
    sv: Object.freeze({ text: \`Den här strängen är \\"inkvoterad\\"\`, rtl: false, languageId: \`sv\` }),
  }
})`
  assert.equal(inject(input, translations).translations, expected)

  console.log()
  console.log(`=== All tests successful ===`)
} catch (e) {
  if (e.expected) {
    console.log(`EXPECTED:
${e.expected}

ACTUAL:
${e.actual}

${e}`)
  } else {
    console.log(e)
  }
}
