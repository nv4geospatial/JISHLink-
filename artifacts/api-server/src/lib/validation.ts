/**
 * Validation rules for employee data fields.
 */

/** Verhoeff checksum for Aadhar validation */
function verhoeff(num: string): boolean {
  const d = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
    [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
    [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
    [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
    [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
    [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
    [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
    [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
    [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
  ];
  const p = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
    [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
    [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
    [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
    [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
    [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
    [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
  ];
  let c = 0;
  const rev = num.split("").reverse().map(Number);
  for (let i = 0; i < rev.length; i++) {
    c = d[c]![p[i % 8]![rev[i]!]!]!;
  }
  return c === 0;
}

export interface ValidationResult {
  field: string;
  valid: boolean;
  message?: string;
}

export function validateEmployeeData(data: Record<string, unknown>): ValidationResult[] {
  const results: ValidationResult[] = [];

  const requiredFields = [
    "full_name", "dob", "gender", "aadhar_number", "pan_number",
    "contact_number", "email", "address", "designation",
  ];
  for (const field of requiredFields) {
    if (!data[field]) {
      results.push({ field, valid: false, message: "Required field missing" });
    } else {
      results.push({ field, valid: true });
    }
  }

  // Aadhar validation
  if (data["aadhar_number"]) {
    const aadhar = String(data["aadhar_number"]).replace(/\s/g, "");
    const valid = /^\d{12}$/.test(aadhar) && verhoeff(aadhar);
    results.push({ field: "aadhar_number_format", valid, message: valid ? undefined : "Invalid Aadhar number" });
  }

  // PAN validation
  if (data["pan_number"]) {
    const valid = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(String(data["pan_number"]));
    results.push({ field: "pan_number_format", valid, message: valid ? undefined : "Invalid PAN format" });
  }

  // IFSC validation
  if (data["ifsc_code"]) {
    const valid = /^[A-Z]{4}0[A-Z0-9]{6}$/.test(String(data["ifsc_code"]));
    results.push({ field: "ifsc_code_format", valid, message: valid ? undefined : "Invalid IFSC code" });
  }

  // Phone validation
  if (data["contact_number"]) {
    const valid = /^[6-9][0-9]{9}$/.test(String(data["contact_number"]));
    results.push({ field: "contact_number_format", valid, message: valid ? undefined : "Invalid phone number" });
  }

  // Email validation
  if (data["email"]) {
    const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(data["email"]));
    results.push({ field: "email_format", valid, message: valid ? undefined : "Invalid email" });
  }

  // DOB / age validation
  if (data["dob"]) {
    const dob = new Date(String(data["dob"]));
    const age = (Date.now() - dob.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
    const valid = age >= 18;
    results.push({ field: "dob_age", valid, message: valid ? undefined : "Must be at least 18 years old" });
  }

  // Bank account validation
  if (data["account_number"]) {
    const valid = /^[0-9]{9,18}$/.test(String(data["account_number"]));
    results.push({ field: "account_number_format", valid, message: valid ? undefined : "Invalid bank account number" });
  }

  return results;
}
