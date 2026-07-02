// Week 2 parser tests: verifies natural-language query to PropertyFilters extraction.
import test from "node:test";
import assert from "node:assert/strict";
import { parsePropertyQuery } from "../src/parsers/propertyQueryParser";

test("parses city, price, beds, type, and pool", async () => {
  const result = await parsePropertyQuery(
    "Show me 3-bedroom condos in Irvine under $1.5M with a pool",
  );
  assert.deepEqual(result, {
    city: "Irvine",
    maxPrice: 1_500_000,
    beds: 3,
    baths: null,
    sqft: null,
    type: "Condominium",
    pool: "True",
    hasView: null,
    maxHoa: null,
  });
});

test("parses k price notation", async () => {
  const result = await parsePropertyQuery("Find homes in Pasadena under 950k");
  assert.equal(result.city, "Pasadena");
  assert.equal(result.maxPrice, 950_000);
});

test("parses comma price notation", async () => {
  const result = await parsePropertyQuery("Homes in Glendale under $1,250,000");
  assert.equal(result.city, "Glendale");
  assert.equal(result.maxPrice, 1_250_000);
});

test("parses beds and baths", async () => {
  const result = await parsePropertyQuery("2 bed 2.5 bath homes in Arcadia");
  assert.equal(result.city, "Arcadia");
  assert.equal(result.beds, 2);
  assert.equal(result.baths, 2.5);
});

test("parses square footage", async () => {
  const result = await parsePropertyQuery("single family in Burbank with 2200 sq ft");
  assert.equal(result.city, "Burbank");
  assert.equal(result.sqft, 2200);
  assert.equal(result.type, "SingleFamilyResidence");
});

test("parses view flag", async () => {
  const result = await parsePropertyQuery("townhome in San Diego with view under 1.1m");
  assert.equal(result.city, "San Diego");
  assert.equal(result.type, "Townhouse");
  assert.equal(result.hasView, "True");
});

test("parses HOA max fee", async () => {
  const result = await parsePropertyQuery("condo in Long Beach under 800k with hoa under $450");
  assert.equal(result.city, "Long Beach");
  assert.equal(result.type, "Condominium");
  assert.equal(result.maxHoa, 450);
});

test("parses uppercase and mixed case", async () => {
  const result = await parsePropertyQuery("FIND CONDO IN ANAHEIM UNDER 700K WITH POOL");
  assert.equal(result.city, "ANAHEIM");
  assert.equal(result.type, "Condominium");
  assert.equal(result.pool, "True");
});

test("returns nulls for missing filters", async () => {
  const result = await parsePropertyQuery("show me listings");
  assert.deepEqual(result, {
    city: null,
    maxPrice: null,
    beds: null,
    baths: null,
    sqft: null,
    type: null,
    pool: null,
    hasView: null,
    maxHoa: null,
  });
});

test("parses land type", async () => {
  const result = await parsePropertyQuery("land in Riverside under 600k");
  assert.equal(result.city, "Riverside");
  assert.equal(result.type, "UnimprovedLand");
  assert.equal(result.maxPrice, 600_000);
});

test("parses single family type phrase", async () => {
  const result = await parsePropertyQuery("single family in Orange with 4 beds under 1.3m");
  assert.equal(result.city, "Orange");
  assert.equal(result.type, "SingleFamilyResidence");
  assert.equal(result.beds, 4);
  assert.equal(result.maxPrice, 1_300_000);
});

test("ignores unsupported criteria and keeps only supported filters", async () => {
  const result = await parsePropertyQuery(
    "Find condos in Irvine under 1.2m with pool, 2 garage spaces, fireplace, and top school district",
  );
  assert.deepEqual(result, {
    city: "Irvine",
    maxPrice: 1_200_000,
    beds: null,
    baths: null,
    sqft: null,
    type: "Condominium",
    pool: "True",
    hasView: null,
    maxHoa: null,
  });
});
