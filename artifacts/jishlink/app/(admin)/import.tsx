import React, { useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, Platform,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as DocumentPicker from "expo-document-picker";
import Toast from "react-native-toast-message";
import * as XLSX from "xlsx";
import { apiFetch } from "@/lib/api";
import { NavHeader } from "@/components/NavHeader";
import colors from "@/constants/colors";

const FIELD_OPTIONS = [
  "full_name", "dob", "gender", "aadhar_number", "pan_number", "contact_number",
  "email", "address", "designation", "qualification", "bank_name", "account_number",
  "ifsc_code", "username", "password", "workplace_id", "skip",
];

interface Row { [key: string]: unknown; }

export default function ImportScreen() {
  const insets = useSafeAreaInsets();
  const c = colors.light;
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success_count: number; error_count: number; errors: unknown[] } | null>(null);

  const pickFile = async () => {
    const res = await DocumentPicker.getDocumentAsync({
      type: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-excel"],
    });
    if (res.canceled || !res.assets?.[0]) return;

    const asset = res.assets[0];
    // For web, read ArrayBuffer; for native, use uri
    try {
      let workbook: XLSX.WorkBook;
      if (Platform.OS === "web") {
        const r = await fetch(asset.uri);
        const ab = await r.arrayBuffer();
        workbook = XLSX.read(ab, { type: "array" });
      } else {
        const { readAsBase64 } = await import("expo-file-system").then((m) => ({ readAsBase64: m.readAsStringAsync }));
        const base64 = await readAsBase64(asset.uri, { encoding: "base64" as any });
        workbook = XLSX.read(base64, { type: "base64" });
      }

      const sheet = workbook.Sheets[workbook.SheetNames[0]!]!;
      const data = XLSX.utils.sheet_to_json<Row>(sheet, { defval: "" });
      if (data.length === 0) { Toast.show({ type: "error", text1: "Empty spreadsheet" }); return; }

      const cols = Object.keys(data[0]!);
      setHeaders(cols);
      setRows(data);

      // Auto-map headers
      const autoMap: Record<string, string> = {};
      cols.forEach((col) => {
        const lower = col.toLowerCase().replace(/\s/g, "_");
        if (FIELD_OPTIONS.includes(lower)) autoMap[col] = lower;
        else autoMap[col] = "skip";
      });
      setMapping(autoMap);
      setResult(null);
      Toast.show({ type: "success", text1: `Loaded ${data.length} rows` });
    } catch (e) {
      Toast.show({ type: "error", text1: "Failed to parse file" });
    }
  };

  const handleImport = async () => {
    if (rows.length === 0) return;
    setLoading(true);
    try {
      const mapped = rows.map((row) =>
        Object.fromEntries(
          Object.entries(mapping)
            .filter(([, v]) => v !== "skip")
            .map(([col, field]) => [field, row[col]])
        )
      );
      const res = await apiFetch<{ success_count: number; error_count: number; errors: unknown[] }>("/employees/import", {
        method: "POST",
        body: JSON.stringify({ rows: mapped }),
      });
      setResult(res);
      Toast.show({ type: "success", text1: `Imported ${res.success_count} rows` });
    } catch (e: unknown) {
      Toast.show({ type: "error", text1: e instanceof Error ? e.message : "Import failed" });
    } finally {
      setLoading(false);
    }
  };

  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <NavHeader title="Bulk Import" showBack />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: bottomPad + 32 }}>
        {/* Upload zone */}
        <TouchableOpacity onPress={pickFile} style={[styles.uploadZone, { borderColor: c.teal, backgroundColor: c.white }]}>
          <Feather name="upload" size={32} color={c.teal} />
          <Text style={[styles.uploadText, { color: c.navy, fontFamily: "Poppins_700Bold" }]}>Upload Excel File</Text>
          <Text style={[styles.uploadSub, { color: c.mutedForeground, fontFamily: "Inter_400Regular" }]}>.xlsx or .xls format</Text>
        </TouchableOpacity>

        {headers.length > 0 && (
          <>
            <View style={[styles.summary, { backgroundColor: c.teal }]}>
              <Text style={[styles.summaryText, { color: c.white, fontFamily: "Inter_600SemiBold" }]}>
                {rows.length} rows detected — map columns below
              </Text>
            </View>

            <View style={[styles.card, { backgroundColor: c.white }]}>
              <Text style={[styles.cardTitle, { color: c.navy, fontFamily: "Poppins_700Bold" }]}>Column Mapping</Text>
              {headers.map((header) => (
                <View key={header} style={styles.mapRow}>
                  <Text style={[styles.colName, { color: c.text, fontFamily: "Inter_500Medium" }]}>{header}</Text>
                  <Feather name="arrow-right" size={14} color={c.mutedForeground} />
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", gap: 6 }}>
                      {FIELD_OPTIONS.slice(0, 6).map((opt) => (
                        <TouchableOpacity
                          key={opt}
                          onPress={() => setMapping((m) => ({ ...m, [header]: opt }))}
                          style={[styles.mapPill, { backgroundColor: mapping[header] === opt ? c.navy : c.muted }]}
                        >
                          <Text style={[styles.mapPillText, { color: mapping[header] === opt ? c.white : c.mutedForeground }]}>{opt}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>
                </View>
              ))}
            </View>

            <TouchableOpacity
              onPress={handleImport}
              style={[styles.importBtn, { backgroundColor: c.gold, opacity: loading ? 0.7 : 1 }]}
              disabled={loading}
            >
              {loading ? <ActivityIndicator color={c.navy} /> : (
                <>
                  <Feather name="download" size={18} color={c.navy} />
                  <Text style={[styles.importBtnText, { color: c.navy, fontFamily: "Poppins_700Bold" }]}>Import Valid Rows</Text>
                </>
              )}
            </TouchableOpacity>
          </>
        )}

        {result && (
          <View style={[styles.resultCard, { backgroundColor: c.white }]}>
            <Text style={[styles.cardTitle, { color: c.navy, fontFamily: "Poppins_700Bold" }]}>Import Result</Text>
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
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  uploadZone: { borderWidth: 2, borderStyle: "dashed", borderRadius: 12, padding: 40, alignItems: "center", gap: 8, marginBottom: 16 },
  uploadText: { fontSize: 16 },
  uploadSub: { fontSize: 13 },
  summary: { borderRadius: 8, padding: 12, marginBottom: 12 },
  summaryText: { fontSize: 14, textAlign: "center" },
  card: { borderRadius: 10, padding: 16, marginBottom: 12, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  cardTitle: { fontSize: 15, marginBottom: 12 },
  mapRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  colName: { width: 90, fontSize: 12 },
  mapPill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14 },
  mapPillText: { fontSize: 11, fontFamily: "Inter_500Medium" },
  importBtn: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8, paddingVertical: 14, borderRadius: 10 },
  importBtnText: { fontSize: 16 },
  resultCard: { borderRadius: 10, padding: 16, marginTop: 8, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  resultRow: { flexDirection: "row", gap: 12 },
  resultBadge: { flex: 1, alignItems: "center", paddingVertical: 16, borderRadius: 8, gap: 4 },
  resultNum: { fontSize: 28 },
  resultLabel: { fontSize: 12 },
});
