import test from "node:test";
import assert from "node:assert/strict";
import { parsePropertyQuery } from "../src/parsePropertyQuery.ts";

async function runSoldParse(query: string) {
  const parsed = await parsePropertyQuery(query);
  console.log("sold query:", query);
  console.log("parsed:", parsed);
  return parsed;
}

test("parses sold condo query with city, max price, and beds", async () => {
  const parsed = await runSoldParse("Show me sold condos in Irvine under 1.5m with 3 bedrooms");

  assert.equal(parsed.city, "Irvine");
  assert.equal(parsed.maxPrice, 1500000);
  assert.equal(parsed.beds, 3);
  assert.equal(parsed.type, "Condominium");
});

test("parses sold single-family query with baths and sqft", async () => {
  const parsed = await runSoldParse(
    "Find sold single family homes in Los Angeles under 2m with 2.5 baths and 1800 sqft",
  );

  assert.equal(parsed.city, "Los Angeles");
  assert.equal(parsed.maxPrice, 2000000);
  assert.equal(parsed.type, "SingleFamilyResidence");
  assert.equal(parsed.baths, 2.5);
  assert.equal(parsed.sqft, 1800);
});

test("parses sold query with city acronym expansion", async () => {
  const parsed = await runSoldParse("sold condos in LA under 900k");

  assert.equal(parsed.city, "Los Angeles");
  assert.equal(parsed.maxPrice, 900000);
  assert.equal(parsed.type, "Condominium");
});

test("parses sold query with no view correctly", async () => {
  const parsed = await runSoldParse("show sold homes in San Diego with 3 beds no view");

  assert.equal(parsed.city, "San Diego");
  assert.equal(parsed.beds, 3);
  assert.equal(parsed.hasView, "0");
});

test("parses sold query with HOA cap", async () => {
  const parsed = await runSoldParse("sold condos in Irvine under 1.1m with hoa under 450");

  assert.equal(parsed.city, "Irvine");
  assert.equal(parsed.maxPrice, 1100000);
  assert.equal(parsed.maxHoa, 450);
  assert.equal(parsed.type, "Condominium");
});

test("returns nulls when sold query has no filter details", async () => {
  const parsed = await runSoldParse("show sold properties");

  assert.deepEqual(parsed, {
    city: null,
    maxPrice: null,
    maxHoa: null,
    beds: null,
    baths: null,
    sqft: null,
    type: null,
    pool: null,
    hasView: null,
  });
});
