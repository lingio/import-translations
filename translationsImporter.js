import https from "https"
import { writeFileSync, readdirSync, lstatSync, readFileSync } from "fs"
import pathTools from "path"

export async function getTranslations() {
  const translations = {}

  const fetch = () =>
    new Promise((fetchRes) => {
      https.get(process.env.TRANSLATIONS_URL, (res) => {
        res.setEncoding("utf8")
        let data = ""
        res.on("data", (chunk) => {
          data += chunk
        })
        res.on("end", () => {
          fetchRes(data)
        })
      })
    })

  const [columns, ...lines] = (await fetch())
    .split("\r\n")
    .map((line) => line.trim().split("\t"))
    .filter((line) => line.length > 1)

  lines.forEach(([id, _batch, _context, _examples, ...dynamicValues]) => {
    const scopes = _context.split(" ")[0].split("/")
    if (id.length < 1 || id[0] === "#") {
      return
    }

    dynamicValues.forEach((v, i) => {
      const k = columns[i + 4]

      if (v.length < 1 || v[0] === "#" || v === "...") {
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

export function* getJavascriptFiles(dir) {
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
