import { afterEach, expect, test, vi } from "vitest"
import { utils, write } from "xlsx"
import {
  extractSheetsGid,
  extractSheetsId,
  gvizToGrid,
  loadSheetFile,
  loadSheetDocument,
  loadGoogleSheetDocument,
  MAX_SHEET_BYTES,
  parseDelimited,
  parseGvizResponseText,
  parseList,
  parseMarkdownTable,
  parseTextDocument,
  parseWorkbook,
  sheetTableFromGvizPayload,
  sheetsGvizUrl,
  sniffDelimiter
} from "../src/lib/tools/sheets.ts"

test("sniffs comma, tab, and semicolon delimiters", () => {
  expect(sniffDelimiter("a,b,c\n1,2,3\n")).toBe(",")
  expect(sniffDelimiter("a\tb\tc\n1\t2\t3\n")).toBe("\t")
  expect(sniffDelimiter("a;b;c\n1;2;3\n")).toBe(";")
})

test("parses quoted commas, escaped quotes, and embedded newlines", () => {
  const grid = parseDelimited('name,note\n"Doe, Jane","said ""hi"""\n"multi\nline",ok\n')
  expect(grid).toEqual([
    ["name", "note"],
    ["Doe, Jane", 'said "hi"'],
    ["multi\nline", "ok"]
  ])
})

test("parses markdown tables with and without outer pipes", () => {
  const grid = parseMarkdownTable("| name | age |\n| :--- | ---: |\n| Ann | 30 |\n| Bob | 41 |\n")
  expect(grid).toEqual([
    ["name", "age"],
    ["Ann", "30"],
    ["Bob", "41"]
  ])
  expect(parseMarkdownTable("name | age\n--- | ---\nAnn | 30\n")).toEqual([
    ["name", "age"],
    ["Ann", "30"]
  ])
  expect(parseMarkdownTable("just some text\nno pipes here\n")).toBeNull()
})

test("routes text documents: tables, grids, and line lists", () => {
  const csv = parseTextDocument("a,b\n1,2\n", "file")
  expect(csv.columns).toEqual(["a", "b"])
  expect(csv.rows).toEqual([["1", "2"]])

  const list = parseTextDocument("Buy milk\nCall Ana\n", "notes")
  expect(list.columns).toEqual(["Item"])
  expect(list.rows).toEqual([["Buy milk"], ["Call Ana"]])

  const blankHeader = parseTextDocument("a,,c\n1,2,3\n", "file")
  expect(blankHeader.columns).toEqual(["a", "Column 2", "c"])

  expect(parseList("  \n\n")).toEqual([])
})

test("truncates huge grids but reports the true total", () => {
  const lines = ["h1,h2"]
  for (let i = 0; i < 5100; i++) lines.push(`${i},x`)
  const table = parseTextDocument(`${lines.join("\n")}\n`, "big")
  expect(table.truncated).toBe(true)
  expect(table.totalRows).toBe(5100)
  expect(table.rows).toHaveLength(5000)
})

test("reads back a workbook round-trip", () => {
  const wb = utils.book_new()
  utils.book_append_sheet(wb, utils.aoa_to_sheet([["name", "n"], ["Ann", 30]]), "People")
  const bytes = write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer
  expect(parseWorkbook(bytes)).toEqual({ name: "People", grid: [["name", "n"], ["Ann", "30"]] })
})

test("extracts sheet ids, gids, and the export url", () => {
  expect(extractSheetsId("https://docs.google.com/spreadsheets/d/abcDEF123-_4567890abcDEF123-_4567890abc12/edit#gid=42")).toBe("abcDEF123-_4567890abcDEF123-_4567890abc12")
  expect(extractSheetsId("abcDEF123-_4567890abcDEF123-_4567890abc12")).toBe("abcDEF123-_4567890abcDEF123-_4567890abc12")
  expect(extractSheetsId("not a link")).toBeNull()
  expect(extractSheetsGid("https://docs.google.com/spreadsheets/d/abcDEF123-_4567890abcDEF123-_4567890abc12/edit#gid=42")).toBe("42")
  expect(extractSheetsGid("https://docs.google.com/spreadsheets/d/abcDEF123-_4567890abcDEF123-_4567890abc12/edit")).toBeNull()
  expect(sheetsGvizUrl("abc", "42")).toBe("https://docs.google.com/spreadsheets/d/abc/gviz/tq?tqx=out:json&headers=1&gid=42")
  expect(sheetsGvizUrl("abc", null)).toBe("https://docs.google.com/spreadsheets/d/abc/gviz/tq?tqx=out:json&headers=1")
})

const GVIZ_SAMPLE = `/*O_o*/
google.visualization.Query.setResponse({"version":"0.6","status":"ok","table":{"cols":[{"label":"Name"},{"label":"Born"}],"rows":[{"c":[{"v":"Ann"},{"v":"Date(1994,4,15)","f":"5/15/1994"}]},{"c":[{"v":"Bob"},null]}]}});`

test("unwraps gviz responses into display grids", () => {
  const payload = parseGvizResponseText(GVIZ_SAMPLE)
  expect(gvizToGrid(payload.table!)).toEqual([
    ["Name", "Born"],
    ["Ann", "5/15/1994"],
    ["Bob", ""]
  ])
  const table = sheetTableFromGvizPayload(payload)
  expect(table.columns).toEqual(["Name", "Born"])
  expect(table.rows).toEqual([
    ["Ann", "5/15/1994"],
    ["Bob", ""]
  ])
  expect(parseGvizResponseText("google.visualization.Query.setResponse({\"status\":\"ok\",\"table\":{\"cols\":[],\"rows\":[]}});")).toMatchObject({
    status: "ok"
  })
})

test("maps gviz dates and access errors to readable messages", () => {
  expect(gvizToGrid({ cols: [{ label: "D" }], rows: [{ c: [{ v: "Date(2024,0,15)" }] }] })).toEqual([["D"], ["2024-01-15"]])
  expect(gvizToGrid({ cols: [{ label: "D" }], rows: [{ c: [{ v: "Date(2024,0,15,10,30,0)" }] }] })).toEqual([
    ["D"],
    ["2024-01-15 10:30:00"]
  ])
  expect(() =>
    sheetTableFromGvizPayload({ status: "error", errors: [{ reason: "access_denied" }] })
  ).toThrow("Anyone-with-the-link")
  expect(() => parseGvizResponseText("not json at all")).toThrow("unreadable")
})

test("loads files by extension and rejects the rest", async () => {
  const csv = await loadSheetFile(new File(["a,b\n1,2\n"], "data.csv", { type: "text/csv" }))
  expect(csv.columns).toEqual(["a", "b"])
  await expect(loadSheetFile(new File(["x"], "photo.png", { type: "image/png" }))).rejects.toThrow(".png")
  await expect(loadSheetFile(new File(["x"], "big.csv"))).resolves.toBeDefined()
})

function multiSheetBytes(): ArrayBuffer {
  const workbook = utils.book_new()
  utils.book_append_sheet(workbook, utils.aoa_to_sheet([["Name", "Count"], ["Ann", 30]]), "People")
  utils.book_append_sheet(workbook, utils.aoa_to_sheet([]), "Empty")
  utils.book_append_sheet(workbook, utils.aoa_to_sheet([["Product", "Price"], ["Tea", 12]]), "Stock & prices")
  return write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer
}

afterEach(() => vi.unstubAllGlobals())

test("imports every worksheet in order, including empty sheets and independent columns", async () => {
  const document = await loadSheetDocument(new File([multiSheetBytes()], "report.xlsx"))
  expect(document.sheets.map((sheet) => sheet.name)).toEqual(["People", "Empty", "Stock & prices"])
  expect(document.sheets[0]).toMatchObject({ columns: ["Name", "Count"], rows: [["Ann", "30"]], totalRows: 1 })
  expect(document.sheets[1]).toMatchObject({ columns: [], rows: [], totalRows: 0 })
  expect(document.sheets[2]).toMatchObject({ columns: ["Product", "Price"], rows: [["Tea", "12"]], totalRows: 1 })
})

test("keeps CSV imports as a single worksheet", async () => {
  const document = await loadSheetDocument(new File(["Name,Count\nAnn,30"], "people.csv"))
  expect(document.sheets).toHaveLength(1)
  expect(document.sheets[0].name).toBe("people")
})

test("downloads the complete Google workbook without narrowing the export to a gid", async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(multiSheetBytes()))
  vi.stubGlobal("fetch", fetchMock)
  const document = await loadGoogleSheetDocument("https://docs.google.com/spreadsheets/d/test-id/edit#gid=42")
  expect(fetchMock).toHaveBeenCalledWith(
    "https://docs.google.com/spreadsheets/d/test-id/export?format=xlsx",
    expect.objectContaining({ credentials: "omit", signal: expect.any(AbortSignal) }),
  )
  expect(document.sheets.map((sheet) => sheet.name)).toEqual(["People", "Empty", "Stock & prices"])
  expect(document.sheets[2].rows).toEqual([["Tea", "12"]])
})

test("rejects inaccessible Google exports and HTML sign-in pages", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Denied", { status: 403 })))
  await expect(loadGoogleSheetDocument("https://docs.google.com/spreadsheets/d/test-id/edit")).rejects.toThrow("sharing")
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>Sign in</html>")))
  await expect(loadGoogleSheetDocument("https://docs.google.com/spreadsheets/d/test-id/edit")).rejects.toThrow("did not return a workbook")
})

test("rejects oversized Google exports with and without a content-length header", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", {
    headers: { "content-length": String(MAX_SHEET_BYTES + 1) },
  })))
  await expect(loadGoogleSheetDocument("https://docs.google.com/spreadsheets/d/test-id/edit")).rejects.toThrow("10 MB")
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new Uint8Array(MAX_SHEET_BYTES + 1))))
  await expect(loadGoogleSheetDocument("https://docs.google.com/spreadsheets/d/test-id/edit")).rejects.toThrow("10 MB")
})

test("rejects invalid links before requesting Google", async () => {
  const fetchMock = vi.fn()
  vi.stubGlobal("fetch", fetchMock)
  await expect(loadGoogleSheetDocument("not a link")).rejects.toThrow("does not look like")
  expect(fetchMock).not.toHaveBeenCalled()
})
