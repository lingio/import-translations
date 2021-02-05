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

const fetchDocument = (url) =>
  new Promise((fetchRes) => {
    https.get(url, (res) => {
      res.setEncoding(`binary`)
      let data = ``
      res.on(`data`, (chunk) => {
        data += chunk
      })
      res.on(`end`, () => {
        if (`${res.statusCode}`[0] === `3`) {
          fetchDocument(res.headers.location).then(fetchRes)
        } else {
          fetchRes(data)
        }
      })
    })
  })

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

  const [columns, ...lines] = input.map((row) => {
    return row[`table:table-cell`].map(parseCell).flat()
  })

  const translations = {}

  lines.forEach(([id, _batch, _context, _examples, ...dynamicValues]) => {
    const scopes = _context.split(` `)[0].split(`/`)
    if (id.length < 1 || id[0] === `#`) {
      return
    }

    dynamicValues.forEach((v, i) => {
      const k = columns[i + 4]

      if (v.length < 1 || v === `...`) {
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

  const odsData = await fetchDocument(url)
  writeFileSync(odsFile, odsData, `binary`)

  const xmlPath = await extractContentXmlFromZip(odsFile, tempPath)
  const xmlData = readFileSync(xmlPath, `utf-8`)

  const xmlParser = new xml2js.Parser()
  const parsedXml = await xmlParser.parseStringPromise(xmlData)
  const cleanXml = cleanDoc(parsedXml)

  return cleanXml
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
