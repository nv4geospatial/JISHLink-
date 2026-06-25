import React, { useState, useRef } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Toast from "react-native-toast-message";
import { useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { NavHeader } from "@/components/NavHeader";
import colors from "@/constants/colors";

// @ts-ignore
import * as XLSX from "xlsx";

type Row = Record<string, unknown>;

const FIELD_OPTIONS = [
  "employee_id", "full_name", "dob", "gender", "blood_group", "marital_status", "qualification",
  "contact_number", "email", "address", "emergency_contact", "nominee_name", "nominee_relation",
  "designation", "employment_type", "date_of_joining",
  "aadhar_number", "pan_number", "pf_number", "esi_number", "uan_number",
  "bank_name", "bank_branch", "account_number", "ifsc_code",
  "driving_license_number", "vehicle_details", "preferred_work_location",
  "recruiter_name", "workplace", "username", "password", "skip",
];

const AUTO_MAP: Record<string, string> = {
  employee_id: "employee_id", id: "employee_id", emp_id: "employee_id",
  full_name: "full_name", name: "full_name", employee_name: "full_name",
  dob: "dob", date_of_birth: "dob", birth_date: "dob",
  gender: "gender", sex: "gender",
  blood_group: "blood_group", bloodgroup: "blood_group", blood: "blood_group",
  marital_status: "marital_status", maritalstatus: "marital_status", marital: "marital_status",
  qualification: "qualification", education: "qualification", degree: "qualification",
  contact_number: "contact_number", phone: "contact_number", mobile: "contact_number", contact: "contact_number",
  email: "email", mail: "email", email_id: "email",
  address: "address", addr: "address", residence: "address",
  emergency_contact: "emergency_contact", emergencycontact: "emergency_contact", emergency_phone: "emergency_contact",
  nominee_name: "nominee_name", nomineename: "nominee_name",
  nominee_relation: "nominee_relation", nomineerelation: "nominee_relation", relation: "nominee_relation",
  designation: "designation", role: "designation", position: "designation", job_title: "designation",
  employment_type: "employment_type", employmenttype: "employment_type", type: "employment_type", job_type: "employment_type",
  date_of_joining: "date_of_joining", doj: "date_of_joining", joining_date: "date_of_joining",
  aadhar_number: "aadhar_number", aadhar: "aadhar_number", aadhaar: "aadhar_number",
  pan_number: "pan_number", pan: "pan_number",
  pf_number: "pf_number", pf: "pf_number", provident_fund: "pf_number",
  esi_number: "esi_number", esi: "esi_number",
  uan_number: "uan_number", uan: "uan_number",
  bank_name: "bank_name", bank: "bank_name",
  bank_branch: "bank_branch", branch: "bank_branch",
  account_number: "account_number", account: "account_number", acc_no: "account_number",
  ifsc_code: "ifsc_code", ifsc: "ifsc_code",
  driving_license_number: "driving_license_number", license: "driving_license_number", dl: "driving_license_number",
  vehicle_details: "vehicle_details", vehicle: "vehicle_details",
  preferred_work_location: "preferred_work_location", work_location: "preferred_work_location", location: "preferred_work_location",
  recruiter_name: "recruiter_name", recruiter: "recruiter_name", reporting_manager: "recruiter_name", reporting_manager_name: "recruiter_name", manager: "recruiter_name",
  workplace: "workplace", workplace_name: "workplace",
  username: "username", user_name: "username", login: "username",
  password: "password", pass: "password", pwd: "password",
};

export default function ImportEmployeesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const c = colors.light;
  const qc = useQueryClient();
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success_count: number; error_count: number; errors: any[] } | null>(null);
  const [showMapping, setShowMapping] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFilePick = () => {
    if (Platform.OS === "web" && fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setResult(null);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]!]!;
      const rawData = XLSX.utils.sheet_to_json<Row>(sheet, { defval: "" });
      if (rawData.length === 0) { Toast.show({ type: "error", text1: "Empty spreadsheet" }); return; }

      let data = rawData;
      
      // Skip consecutive header rows
      const headerKeywords = ["employee_id", "recruiter_id", "full_name", "dob", "gender", "blood_group", "marital_status", "qualification", "contact_number", "email", "address", "emergency_contact", "nominee_name", "nominee_relation", "designation", "employment_type", "date_of_joining", "aadhar_number", "pan_number", "pf_number", "esi_number", "uan_number", "bank_name", "bank_branch", "account_number", "ifsc_code", "driving_license_number", "vehicle_details", "username", "password", "recruiter_name", "reporting_manager_name"];
      
      while (data.length > 0) {
        const firstRowValues = Object.values(data[0]);
        const looksLikeHeader = firstRowValues.some((v) =>
          typeof v === "string" && headerKeywords.some((h) => String(v).toLowerCase().replace(/_/g, "").includes(h.replace(/_/g, "")))
        );
        if (looksLikeHeader) {
          data = data.slice(1);
        } else {
          break;
        }
      }

      // Filter out empty rows
      data = data.filter((row) => {
        const values = Object.values(row);
        return values.some((v) => v !== "" && v !== null && v !== undefined && String(v).trim() !== "");
      });

      // Filter out rows where full_name is empty or looks like a header
      data = data.filter((row) => {
        const fullName = row["full_name"];
        return fullName && String(fullName).trim() !== "" && String(fullName).toLowerCase() !== "full_name";
      });

      // Filter out rows where recruiter_name is a header text
      data = data.filter((row) => {
        const recruiterName = row["recruiter_name"];
        if (!recruiterName) return true;
        const clean = String(recruiterName).trim().toLowerCase();
        return clean !== "recruiter_name" && clean !== "reporting_manager_name" && clean !== "reporting_manager";
      });

      const cols = Object.keys(data[0]!);
      setHeaders(cols);
      setRows(data);

      const autoMap: Record<string, string> = {};
      cols.forEach((col) => {
        const lower = col.toLowerCase().replace(/\s/g, "_");
        if (AUTO_MAP[lower]) autoMap[col] = AUTO_MAP[lower];
      });
      setMapping(autoMap);
      Toast.show({ type: "success", text1: `${data.length} rows loaded` });
    } catch (e) {
      Toast.show({ type: "error", text1: "Failed to read file", text2: String(e) });
    }
  };

  const handleImport = async () => {
    const mappedRows = rows.map((row) => {
      const mapped: Record<string, unknown> = {};
      headers.forEach((h) => {
        const field = mapping[h];
        if (field && field !== "skip") mapped[field] = row[h];
      });
      return mapped;
    });

    const validRows = mappedRows.filter((r) => r.full_name);
    if (validRows.length === 0) {
      Toast.show({ type: "error", text1: "No valid rows to import" });
      return;
    }

    setLoading(true);
    try {
      const res = await apiFetch("/employees/import", {
        method: "POST",
        body: JSON.stringify({ rows: validRows }),
      }) as { success_count: number; error_count: number; errors: any[] };
      setResult(res);
      await qc.invalidateQueries({ queryKey: ["employees"] });
      await qc.refetchQueries({ queryKey: ["employees"] });
      await qc.invalidateQueries({ queryKey: ["admin-dashboard"] });
      Toast.show({ type: "success", text1: `Imported ${res.success_count} employees` });
    } catch (e: unknown) {
      Toast.show({ type: "error", text1: e instanceof Error ? e.message : "Import failed" });
    } finally {
      setLoading(false);
    }
  };

  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <NavHeader title="Import Employees" showBack onBack={() => router.replace("/(admin)/dashboard")} />

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: bottomPad + 32 }}>
        {/* File Upload */}
        <View style={[styles.section, { backgroundColor: c.white }]}>
          <Text style={[styles.sectionTitle, { color: c.navy, fontFamily: "Poppins_700Bold" }]}>Upload Excel File</Text>
          <Text style={[styles.hint, { color: c.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            Upload .xlsx or .csv file with employee details. Required: full_name, username, password. Include recruiter_name to auto-assign.
          </Text>
          <TouchableOpacity onPress={handleFilePick} style={[styles.fileBtn, { backgroundColor: c.navy }]}>
            <Feather name="upload" size={18} color={c.white} />
            <Text style={[styles.fileBtnText, { color: c.white, fontFamily: "Inter_600SemiBold" }]}>
              {fileName ? fileName : "Choose File"}
            </Text>
          </TouchableOpacity>
          {Platform.OS === "web" && (
            <input
              type="file"
              accept=".xlsx,.csv"
              ref={fileInputRef}
              onChange={handleFileChange}
              style={{ display: "none" }}
            />
          )}
        </View>

        {/* Toggle Mapping Button */}
        {headers.length > 0 && (
          <TouchableOpacity
            onPress={() => setShowMapping(!showMapping)}
            style={[styles.toggleBtn, { backgroundColor: c.navy }]}
          >
            <Feather name={showMapping ? "chevron-up" : "chevron-down"} size={16} color={c.white} />
            <Text style={[styles.toggleText, { color: c.white, fontFamily: "Inter_600SemiBold" }]}>
              {showMapping ? "Hide Column Mapping" : "View Column Mapping"}
            </Text>
          </TouchableOpacity>
        )}

        {/* Collapsible Column Mapping */}
        {showMapping && headers.length > 0 && (
          <View style={[styles.section, { backgroundColor: c.white }]}>
            <Text style={[styles.sectionTitle, { color: c.navy, fontFamily: "Poppins_700Bold" }]}>Column Mapping</Text>
            <Text style={[styles.hint, { color: c.mutedForeground, fontFamily: "Inter_400Regular", marginBottom: 12 }]}>
              Click a pill to map each column. Map <Text style={{ fontWeight: "bold" }}>recruiter_name</Text> to auto-assign employees to recruiters.
            </Text>
            {headers.map((header) => (
              <View key={header} style={styles.mapRow}>
                <Text style={[styles.colName, { color: c.text, fontFamily: "Inter_500Medium" }]}>{header}</Text>
                <Feather name="arrow-right" size={14} color={c.mutedForeground} />
                <View style={{ flex: 1, flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                  {FIELD_OPTIONS.map((opt) => (
                    <TouchableOpacity
                      key={opt}
                      onPress={() => setMapping((m) => ({ ...m, [header]: opt }))}
                      style={[styles.mapPill, { backgroundColor: mapping[header] === opt ? c.navy : c.muted }]}
                    >
                      <Text style={[styles.mapPillText, { color: mapping[header] === opt ? c.white : c.mutedForeground }]}>{opt}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ))}
            <TouchableOpacity onPress={handleImport} style={[styles.importBtn, { backgroundColor: c.gold }]} disabled={loading}>
              {loading ? <ActivityIndicator color={c.navy} /> : (
                <>
                  <Feather name="download" size={16} color={c.navy} />
                  <Text style={[styles.importBtnText, { color: c.navy, fontFamily: "Poppins_700Bold" }]}>Import {rows.length} Employees</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Import Button (always visible) */}
        {headers.length > 0 && !showMapping && (
          <TouchableOpacity onPress={handleImport} style={[styles.importBtn, { backgroundColor: c.gold, marginTop: 12 }]} disabled={loading}>
            {loading ? <ActivityIndicator color={c.navy} /> : (
              <>
                <Feather name="download" size={16} color={c.navy} />
                <Text style={[styles.importBtnText, { color: c.navy, fontFamily: "Poppins_700Bold" }]}>Import {rows.length} Employees</Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {/* Result */}
        {result && (
          <View style={[styles.section, { backgroundColor: c.white }]}>
            <Text style={[styles.sectionTitle, { color: c.navy, fontFamily: "Poppins_700Bold" }]}>Import Result</Text>
            <View style={styles.resultRow}>
              <View style={[styles.resultBadge, { backgroundColor: "#D1FAE5" }]}>
                <Feather name="check-circle" size={20} color="#065F46" />
                <Text style={[styles.resultNum, { color: "#065F46", fontFamily: "Poppins_700Bold" }]}>{result.success_count}</Text>
                <Text style={[styles.resultLabel, { color: "#065F46", fontFamily: "Inter_400Regular" }]}>Imported</Text>
              </View>
              <View style={[styles.resultBadge, { backgroundColor: "#FEE2E2" }]}>
                <Feather name="x-circle" size={20} color="#991B1B" />
                <Text style={[styles.resultNum, { color: "#991B1B", fontFamily: "Poppins_700Bold" }]}>{result.error_count}</Text>
                <Text style={[styles.resultLabel, { color: "#991B1B", fontFamily: "Inter_400Regular" }]}>Errors</Text>
              </View>
            </View>
            {result.errors && result.errors.length > 0 && (
              <View style={{ marginTop: 12 }}>
                <Text style={[styles.errorTitle, { color: c.navy, fontFamily: "Inter_600SemiBold" }]}>Error Details:</Text>
                {result.errors.slice(0, 10).map((err, idx) => (
                  <Text key={idx} style={[styles.errorDetail, { color: c.destructive }]}>
                    Row {err.row}: {err.error} {err.details ? `(${err.details})` : ""}
                  </Text>
                ))}
                {result.errors.length > 10 && (
                  <Text style={[styles.errorMore, { color: c.mutedForeground }]}>... and {result.errors.length - 10} more errors</Text>
                )}
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  section: { borderRadius: 10, padding: 16, marginBottom: 12, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  sectionTitle: { fontSize: 15, marginBottom: 10 },
  hint: { fontSize: 12, marginBottom: 12, lineHeight: 18 },
  fileBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 8 },
  fileBtnText: { fontSize: 14 },
  mapRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#F3F4F6" },
  colName: { width: 120, fontSize: 12 },
  mapPill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16 },
  mapPillText: { fontSize: 11, fontFamily: "Inter_500Medium" },
  importBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 8, marginTop: 16 },
  importBtnText: { fontSize: 15 },
  resultRow: { flexDirection: "row", gap: 12, marginTop: 10 },
  resultBadge: { flex: 1, alignItems: "center", padding: 12, borderRadius: 8, gap: 4 },
  resultNum: { fontSize: 22 },
  resultLabel: { fontSize: 12 },
  errorTitle: { fontSize: 14, marginBottom: 8 },
  errorDetail: { fontSize: 11, marginBottom: 4 },
  errorMore: { fontSize: 12, marginTop: 4, fontStyle: "italic" },
  toggleBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12, borderRadius: 8, marginBottom: 12 },
  toggleText: { fontSize: 14 },
});