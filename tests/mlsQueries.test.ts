import assert from "node:assert/strict";
import test from "node:test";
import { parsePropertyQuery } from "../src/parsers/propertyQueryParser";
import { buildActiveListingsQuery, buildSoldCompsQuery } from "../src/services/mlsQueryBuilders";

test("buildActiveListingsQuery uses parameterized placeholders", async () => {
  const filters = await parsePropertyQuery(
    "Show me 3-bedroom condos in Irvine under $1.5M with a pool and HOA under $500",
  );
  const { sql, params } = buildActiveListingsQuery(filters, 2, 10);

  assert.ok(sql.includes("L_City = ?"));
  assert.ok(sql.includes("L_SystemPrice <= ?"));
  assert.ok(sql.includes("L_Keyword2 >= ?"));
  assert.ok(sql.includes("PoolPrivateYN = ?"));
  assert.ok(sql.includes("AssociationFee <= ?"));
  assert.ok(sql.includes("LIMIT ? OFFSET ?"));
  assert.equal(params[0], "Irvine");
  assert.equal(params[params.length - 2], 10);
  assert.equal(params[params.length - 1], 10);
  assert.equal(sql.includes("Irvine"), false);
});

test("buildActiveListingsQuery skips unset filters", async () => {
  const filters = await parsePropertyQuery("show me listings");
  const { sql, params } = buildActiveListingsQuery(filters, 1, 25);

  assert.equal(sql.includes("L_City = ?"), false);
  assert.equal(sql.includes("AssociationFee <= ?"), false);
  assert.ok(sql.includes("LIMIT ? OFFSET ?"));
  assert.deepEqual(params, [25, 0]);
});

test("buildSoldCompsQuery is parameterized and bounded", () => {
  const { sql, params } = buildSoldCompsQuery("Irvine", 6);

  assert.ok(sql.includes("WHERE City = ?"));
  assert.ok(sql.includes("INTERVAL ? MONTH"));
  assert.ok(sql.includes('PropertyType = "Residential"'));
  assert.ok(sql.includes("LIMIT 50"));
  assert.deepEqual(params, ["Irvine", 6]);
});
