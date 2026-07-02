// Parses a free-text real estate query into the 9 supported Week 2 filters only.
import { PropertyFilters } from "../types/PropertyFilters";

const typeMap: Record<string, string> = {
  condo: "Condominium",
  townhome: "Townhouse",
  "single family": "SingleFamilyResidence",
  land: "UnimprovedLand",
};

export async function parsePropertyQuery(query: string): Promise<PropertyFilters> {
  const cityMatch = query.match(/in ([A-Za-z\s]+?)(?:\s+under|\s+with|\s+at|$)/i);
  const priceMatch = query.match(/under \$?([\d,.]+)(k|m)?/i);
  const bedsMatch = query.match(/(\d+)[\s-]*(bed|beds|bedroom|bedrooms)/i);
  const bathsMatch = query.match(/(\d+(?:\.5)?)[\s-]*(bath|baths|bathroom)/i);
  const sqftMatch = query.match(/(\d+)[\s,]*(sqft|sq ft|square feet)/i);
  const hoaMatch = query.match(/hoa(?: fee)?(?: under| max)? \$?([\d,]+)/i);

  const poolMatch = /pool/i.test(query);
  const viewMatch = /view/i.test(query);

  const typeKey = Object.keys(typeMap).find((k) => query.toLowerCase().includes(k));

  let maxPrice: number | null = null;
  if (priceMatch) {
    maxPrice = Number(priceMatch[1].replace(/,/g, ""));
    if (priceMatch[2]?.toLowerCase() === "k") {
      maxPrice *= 1_000;
    }
    if (priceMatch[2]?.toLowerCase() === "m") {
      maxPrice *= 1_000_000;
    }
  }

  return {
    city: cityMatch?.[1]?.trim() || null,
    maxPrice,
    beds: bedsMatch ? Number(bedsMatch[1]) : null,
    baths: bathsMatch ? Number(bathsMatch[1]) : null,
    sqft: sqftMatch ? Number(sqftMatch[1]) : null,
    type: typeKey ? typeMap[typeKey] : null,
    pool: poolMatch ? "True" : null,
    hasView: viewMatch ? "True" : null,
    maxHoa: hoaMatch ? Number(hoaMatch[1].replace(/,/g, "")) : null,
  };
}

export const propertyQueryParser = parsePropertyQuery;
