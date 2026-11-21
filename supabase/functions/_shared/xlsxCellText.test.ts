import assert from "node:assert/strict";
import test from "node:test";
import { cellTextsFromSheetXml, sharedStringsFromXml } from "./xlsxCellText.ts";

test("rich text keeps the chapter after the book name", () => {
  const xml = `
    <sst>
      <si><t>Psalm</t><r><rPr><b/></rPr><t> 19</t></r></si>
      <si><t>Acts 27</t><r><t> pt.1</t></r></si>
      <si><r><t>2 Samuel 1</t></r></si>
    </sst>
  `;
  assert.deepEqual(sharedStringsFromXml(xml), ["Psalm 19", "Acts 27 pt.1", "2 Samuel 1"]);
});

test("worksheet cells use the full shared string", () => {
  const shared = sharedStringsFromXml(`
    <sst>
      <si><t>Psalm</t><r><t> 132</t></r></si>
    </sst>
  `);
  const sheet = `
    <sheetData>
      <c r="B310" t="s"><v>0</v></c>
      <c r="C310" t="inlineStr"><is><t>Vision</t><r><t> Service?</t></r></is></c>
    </sheetData>
  `;
  const cells = cellTextsFromSheetXml(sheet, shared);
  assert.equal(cells.get("B310"), "Psalm 132");
  assert.equal(cells.get("C310"), "Vision Service?");
});
