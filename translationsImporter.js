import https from "https"
import {
  writeFileSync,
  readdirSync,
  lstatSync,
  readFileSync,
  statSync,
} from "fs"
import pathTools from "path"
import tmp from "tmp"
import StreamZip from "node-stream-zip"
import xml2js from "xml2js"

const fetchDocument = (url) => {
  console.log(`Fetching ${url}`)
  return new Promise((fetchRes) => {
    try {
      https.get(url, (res) => {
        res.setEncoding(`binary`)
        let data = ``
        res.on(`data`, (chunk) => {
          data += chunk
        })
        res.on(`error`, e => {
          console.error(`Failed`, e);
          fetchRes(null)
        })
        res.on(`end`, () => {
          if (`${res.statusCode}`[0] === `3`) {
            fetchDocument(res.headers.location).then(fetchRes)
          } else {
            fetchRes(data)
          }
        })
      })
    } catch(e) {
      console.error(`Failed`, e);
      fetchRes(null)
    }
  })
}

const fetchDocumentWithRetry = async (url) => {
  let attempts = 10

  while(attempts > 0) {
    const doc = await fetchDocument(url)
    console.log(`Got ${doc.length} bytes`)
    if (doc) {
      return doc
    }

    await (new Promise(resolve => {
      setTimeout(resolve, 1000)
    }))

    console.log('Retrying fetch...')
    attempts --;
  }

  return null
}


const extractContentXmlFromZip = (zipPath, tempPath) =>
  new Promise((resolve, reject) => {
    const zip = new StreamZip({ file: zipPath })

    zip.on(`ready`, () => {
      const xmlPath = pathTools.join(tempPath, `extracted.xml`)
      zip.extract(`content.xml`, xmlPath, (err) => {
        if (err) {
          console.error(`Failed to find open office content in zip file`)
          reject()
        } else {
          zip.close()
          resolve(xmlPath)
        }
      })
    })

    zip.on(`error`, (e) => {
      console.error(
        `Failed to unpack zip file, is your env variable pointing to the ods export?`
      )
      reject(null)
    })
  })

const getCellTextValue = (input) => {
  // Different ways a cell could look
  // {
  //   "$": {
  //     "table:style-name": "ce1",
  //     "office:value-type": "string",
  //     "calcext:value-type": "string"
  //   },
  //   "text:p": [
  //     "line 1"
  //   ]
  // }
  // {
  //   "$": {
  //     "table:style-name": "ce50",
  //     "office:value-type": "string",
  //     "calcext:value-type": "string"
  //   },
  //   "text:p": [
  //     {
  //       "text:a": [
  //         {
  //           "_": "line 1",
  //           "$": {
  //             "xlink:href": "https://lingio.github.io/web-ui/#x-page-portal-current",
  //             "xlink:type": "simple"
  //           }
  //         }
  //       ]
  //     }
  //   ]
  // }
  // {
  //   "$": {
  //     "table:style-name": "ce52",
  //     "office:value-type": "string",
  //     "calcext:value-type": "string"
  //   },
  //   "text:p": [
  //     "line 1",
  //     "line 2",
  //     "line 3"
  //     ...
  //   ]
  // }

  if (!input) {
    return ``
  }

  input = input[`text:p`]

  if (!input) {
    return ``
  }

  input = input
    .map((line) => {
      if (typeof line === `string`) {
        return line
      }

      if (line[`text:a`]) {
        return line[`text:a`][0][`_`]
      }

      if (line[`_`]) {
        return line[`_`]
      }

      return ``
    })
    .join(`\n`)

  return input
}

const getCellRepeatCount = (input) => {
  // And a cell could contain a repeat command
  // {
  //   "$": {
  //     "table:number-columns-repeated": "1006"
  //   }
  // }

  if (!input) {
    return 1
  }

  input = input[`$`]

  if (!input) {
    return 1
  }

  input = input[`table:number-columns-repeated`]

  if (!input) {
    return 1
  }

  return ~~input
}

const parseCell = (input) => {
  const text = getCellTextValue(input)
  const repeat = getCellRepeatCount(input)
  const out = []
  for (let i = 0; i < repeat; i++) {
    out.push(text)
  }
  return out
}

const cleanDoc = (input) => {
  input = input[`office:document-content`]
  input = input[`office:body`][0]
  input = input[`office:spreadsheet`][0]
  input = input[`table:table`][0]
  input = input[`table:table-row`]

  const [columnNames, ...lines] = input.map((row) => {
    return row[`table:table-cell`].map(parseCell).flat()
  })

  const idColumn = columnNames.indexOf(`id`)
  const languageColumns = columnNames
    .map((c, i) => {
      // Ignore id column
      if (i === idColumn) return false
      if (!c) return false
      // Ignore columns that starts with underscore, dot or Uppercase letter
      const m1 = c.match(/(^_|^\.|^[A-Z])/)
      if (m1) return false
      // Find columns that look like a language code
      const m2 = c.match(/^([a-z]{2,3}(\-[a-z]{2,3})?)/i)
      if (!m2) return false
      return c
    })
    .filter((c) => c)

  const translations = {}

  lines.forEach((line) => {
    const keyed = {}
    columnNames.forEach((cn, i) => {
      keyed[cn] = line[i]
    })

    const id = keyed[`id`]
    if (!id || id.length < 1 || id[0] === `#`) {
      return
    }

    languageColumns.forEach((k) => {
      const v = keyed[k]

      if (!v || v.length < 1 || v === `...`) {
        return
      }

      if (translations[k] === undefined) {
        translations[k] = {}
      }

      translations[k][id] = v
    })
  })

  return translations
}

export async function getTranslations() {
  const url = process.env.TRANSLATIONS_URL

  const tempPath = tmp.dirSync().name
  const odsFile = pathTools.join(tempPath, `source.ods`)

  const odsData = await fetchDocumentWithRetry(url)
  if (!odsData) {
    return null
  }
  writeFileSync(odsFile, odsData, `binary`)

  const xmlPath = await extractContentXmlFromZip(odsFile, tempPath)
  const xmlData = readFileSync(xmlPath, `utf-8`)

  const xmlParser = new xml2js.Parser()
  const parsedXml = await xmlParser.parseStringPromise(xmlData)

  const output = cleanDoc(parsedXml)
  return output
}

export function* getJavascriptFiles(dirOrFile) {
  if (statSync(dirOrFile).isFile()) {
    const file = dirOrFile
    yield file
  } else {
    const dir = dirOrFile
    for (const file of readdirSync(dir)) {
      const path = pathTools.join(dir, file)
      const stat = lstatSync(path)
      if (stat.isDirectory()) {
        yield* getJavascriptFiles(path) //recurse
      } else if (path.endsWith(`.js`)) {
        yield path
      }
    }
  }
}

export async function getTranslationsFile(forFile) {
  const location1 = forFile.replace(/\.js$/, `.translations.js`)

  const directory2 = forFile.replace(/\.js$/, ``)
  const location2 = forFile.replace(/\.js$/, `/translations.js`)

  if (dirExists(directory2)) {
    return location2
  } else {
    return location1
  }
}

function dirExists(path) {
  try {
    return statSync(path).isDirectory()
  } catch (e) {
    return false
  }
}
