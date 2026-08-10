import test from "node:test";
import assert from "node:assert/strict";
import { parsePropertyQuery } from "../src/parsePropertyQuery.ts";
import { validateSearchFilters } from "../src/validateActiveSearchFilters.ts";

async function runQueryPipeline(query: string) {
  const parsed = await parsePropertyQuery(query);
  const validation = await validateSearchFilters(parsed);
  console.log("query:", query);
  console.log("parsed:", parsed);
  console.log("validation:", validation);
  return { parsed, validation };
}

test("parses beds, city, max price, type, and pool", async () => {
  const query = "Show me 3-bedroom condos in Irvine under $1.5M with a pool";
  const { parsed, validation } = await runQueryPipeline(query);

  assert.equal(parsed.city, "Irvine");
  assert.equal(parsed.maxPrice, 1500000);
  assert.equal(parsed.maxHoa, null);
  assert.equal(parsed.beds, 3);
  assert.equal(parsed.type, "Condominium");
  assert.equal(parsed.pool, "True");
  assert.equal(parsed.baths, null);
  assert.equal(parsed.sqft, null);
  assert.equal(parsed.hasView, null);
  assert.equal(typeof validation.ok, "boolean");
});

test("parses bathrooms, sqft, and view", async () => {
  const query = "Find townhomes in Pasadena with 2.5 baths and 1800 sq ft with view";
  const { parsed, validation } = await runQueryPipeline(query);

  assert.equal(parsed.city, "Pasadena");
  assert.equal(parsed.type, "Townhouse");
  assert.equal(parsed.baths, 2.5);
  assert.equal(parsed.sqft, 1800);
  assert.equal(parsed.hasView, "True");
  assert.equal(typeof validation.ok, "boolean");
});

test("returns nulls when filters are absent", async () => {
  const query = "Show listings";
  const { parsed, validation } = await runQueryPipeline(query);

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
  assert.equal(typeof validation.ok, "boolean");
});

test("parses k price suffix", async () => {
  const query = "Find homes in Glendale under 900k";
  const { parsed, validation } = await runQueryPipeline(query);
  assert.equal(parsed.city, "Glendale");
  assert.equal(parsed.maxPrice, 900000);
  assert.equal(typeof validation.ok, "boolean");
});

test("parses m price suffix without dollar sign", async () => {
  const query = "single family in Riverside under 2m";
  const { parsed, validation } = await runQueryPipeline(query);

  assert.equal(parsed.city, "Riverside");
  assert.equal(parsed.maxPrice, 2000000);
  assert.equal(parsed.type, "SingleFamilyResidence");
  assert.equal(typeof validation.ok, "boolean");
});

test("parses land type", async () => {
  const query = "Find land in Temecula under 500k";
  const { parsed, validation } = await runQueryPipeline(query);

  assert.equal(parsed.city, "Temecula");
  assert.equal(parsed.type, "UnimprovedLand");
  assert.equal(parsed.maxPrice, 500000);
  assert.equal(typeof validation.ok, "boolean");
});

test("parses beds using plural bedrooms", async () => {
  const query = "Show homes in Anaheim with 4 bedrooms";
  const { parsed, validation } = await runQueryPipeline(query);

  assert.equal(parsed.city, "Anaheim");
  assert.equal(parsed.beds, 4);
  assert.equal(typeof validation.ok, "boolean");
});

test("parses baths using bath keyword", async () => {
  const query = "Condo in Burbank with 3 bath";
  const { parsed, validation } = await runQueryPipeline(query);

  assert.equal(parsed.city, "Burbank");
  assert.equal(parsed.baths, 3);
  assert.equal(parsed.type, "Condominium");
  assert.equal(typeof validation.ok, "boolean");
});

test("parses sqft using square feet phrase", async () => {
  const query = "townhome in Torrance with 2200 square feet";
  const { parsed, validation } = await runQueryPipeline(query);

  assert.equal(parsed.city, "Torrance");
  assert.equal(parsed.sqft, 2200);
  assert.equal(parsed.type, "Townhouse");
  assert.equal(typeof validation.ok, "boolean");
});

test("detects view and pool flags", async () => {
  const query = "single family in Malibu with ocean view and pool";
  const { parsed, validation } = await runQueryPipeline(query);

  assert.equal(parsed.city, "Malibu");
  assert.equal(parsed.pool, "True");
  assert.equal(parsed.hasView, "True");
  assert.equal(typeof validation.ok, "boolean");
});

test("parses max HOA", async () => {
  const query = "Show condos in Irvine under $1.2M with HOA under $500";
  const { parsed, validation } = await runQueryPipeline(query);

  assert.equal(parsed.city, "Irvine");
  assert.equal(parsed.maxPrice, 1200000);
  assert.equal(parsed.maxHoa, 500);
  assert.equal(parsed.type, "Condominium");
  assert.equal(typeof validation.ok, "boolean");
});

test("expands common city acronyms", async () => {
  const laQuery = "show condos in LA under 1m";
  const sdQuery = "show condos in SD under 1m";
  const sbQuery = "show condos in SB under 1m";
  const scQuery = "show condos in SC under 1m";

  const la = await runQueryPipeline(laQuery);
  const sd = await runQueryPipeline(sdQuery);
  const sb = await runQueryPipeline(sbQuery);
  const sc = await runQueryPipeline(scQuery);

  assert.equal(la.parsed.city, "Los Angeles");
  assert.equal(sd.parsed.city, "San Diego");
  assert.equal(sb.parsed.city, "Santa Barbara");
  assert.equal(sc.parsed.city, "Santa Clarita");
  assert.equal(typeof la.validation.ok, "boolean");
  assert.equal(typeof sd.validation.ok, "boolean");
  assert.equal(typeof sb.validation.ok, "boolean");
  assert.equal(typeof sc.validation.ok, "boolean");
});

test("parse + validate blocks invalid city", async () => {
  const query = "show condos in Atlantis under 1m";
  const { validation } = await runQueryPipeline(query);
  assert.equal(validation.ok, false);
  if (!validation.ok) {
    assert.equal(validation.field, "city");
  }
});

test("parse + validate passes valid city", async () => {
  const query = "show condos in Irvine under 1m";
  const { validation } = await runQueryPipeline(query);
  assert.equal(validation.ok, true);
});
