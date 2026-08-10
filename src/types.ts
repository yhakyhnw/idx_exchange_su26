export type PropertyFilters = {
  city: string | null;
  maxPrice: number | null;
  maxHoa: number | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  type: string | null;
  pool: string | null;
  hasView: string | null;
};

export type ListingRow = {
  L_ListingID: string;
  L_DisplayId: string;
  L_Address: string;
  L_City: string;
  L_Zip: string;
  price: number;
  beds: number;
  baths: number;
  sqft: number;
  type: string;
  status: string;
  lat: number;
  lng: number;
  YearBuilt: number;
  AssociationFee: number;
  DaysOnMarket: number;
  PoolPrivateYN: string;
  ViewYN: string;
  FireplaceYN: string;
  PhotoCount: number;
  LA1_UserFirstName: string;
  LA1_UserLastName: string;
  LO1_OrganizationName: string;
};

export type SoldRow = {
  ListingKey: number;
  UnparsedAddress: string;
  City: string;
  CloseDate: string;
  ClosePrice: number;
  OriginalListPrice: number;
  ListPrice: number;
  DaysOnMarket: number;
  BedroomsTotal: number;
  BathroomsTotalInteger: number;
  LivingArea: number;
  PropertyType: string;
  PropertySubType: string;
  YearBuilt: number;
  ListAgentFullName: string;
  ListOfficeName: string;
  BuyerOfficeName: string;
};
