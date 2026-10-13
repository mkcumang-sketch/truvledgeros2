export const CLIENT_TYPES = [
  "Pvt Ltd",
  "LLP",
  "Proprietorship",
  "Individual",
  "Partnership",
  "Public Ltd",
  "Trust",
  "Society",
  "Other",
] as const;

export type ClientType = (typeof CLIENT_TYPES)[number];

// PAN Regex: 5 letters, 4 digits, 1 letter
export const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
// GSTIN Regex: 2 digit state code, 10 char PAN, 1 entity digit, Z, 1 check digit
export const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
