export async function parsePropertyQuery(query: string) {
  const cityMatch = query.match(/in ([A-Za-z\s]+?)(?:\s+under|\s+with|\s+at|$)/i);
  const priceMatch = query.match(/under \$?([\d,.]+)\s*(k|m)?/i);
  const maxHoaMatch =
    query.match(/hoa\s*(?:under|max|<=)?\s*\$?([\d,]+)/i) ??
    query.match(/under\s+hoa\s*\$?([\d,]+)/i);
  const bedsMatch = query.match(/(\d+)[\s-]*(bd|br|bed|beds|bedroom|bedrooms)/i);
  const bathsMatch = query.match(/(\d+(?:\.5)?)[\s-]*(ba|bath|baths|bathroom)/i);
  const sqftMatch = query.match(/(\d+)[\s,]*(sqft|sq ft|square feet)/i);
  const poolMatch = /pool/i.test(query);
  const noViewMatch = /no\s+view/i.test(query);
  const viewMatch = /view/i.test(query) && !noViewMatch;
  const typeMap: Record<string, string> = {
    condo: "Condominium",
    townhome: "Townhouse",
    "single family": "SingleFamilyResidence",
    land: "UnimprovedLand",
  };
  
  const typeKey = Object.keys(typeMap).find((k) => query.toLowerCase().includes(k));
  const cityAliasMap: Record<string, string> = {
    LA: "Los Angeles",
    SD: "San Diego",
    SB: "Santa Barbara",
    SC: "Santa Clarita",
    SF: "San Francisco",
    SJ: "San Jose",
    OC: "Orange County",
  };

  const rawCity = cityMatch?.[1]?.trim() || null;
  const mappedCity = rawCity ? cityAliasMap[rawCity.toUpperCase()] ?? rawCity : null;
  const outputCity = mappedCity
    ? mappedCity
        .toLowerCase()
        .split(" ")
        .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : word))
        .join(" ")
    : null;
  let maxPrice = null;
  if (priceMatch) {
    maxPrice = Number(priceMatch[1].replace(/,/g, ""));
    if (priceMatch[2]?.toLowerCase() === "k") maxPrice *= 1000;
    if (priceMatch[2]?.toLowerCase() === "m") maxPrice *= 1_000_000;
  }
  const maxHoa = maxHoaMatch ? Number(maxHoaMatch[1].replace(/,/g, "")) : null;
  return {
    city: outputCity,
    maxPrice,
    maxHoa,
    beds: bedsMatch ? Number(bedsMatch[1]) : null,
    baths: bathsMatch ? Number(bathsMatch[1]) : null,
    sqft: sqftMatch ? Number(sqftMatch[1]) : null,
    type: typeKey ? typeMap[typeKey] : null,
    pool: poolMatch ? "True" : null,
    hasView: noViewMatch ? "False" : viewMatch ? "True" : null,
  };
}
