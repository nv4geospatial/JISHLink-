import React, { useState, useMemo } from "react";
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, Platform, ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { NavHeader } from "@/components/NavHeader";
import { LoadingScreen } from "@/components/LoadingScreen";
import { EmptyState } from "@/components/EmptyState";
import colors from "@/constants/colors";

interface Employee {
  id: string; full_name: string; employee_code: string;
  designation?: string | null; email?: string | null;
  contact_number?: string | null; workplace?: { name: string } | null;
  employment_status?: string | null; role?: string | null;
  gender?: string | null; dob?: string | null;
  blood_group?: string | null; qualification?: string | null;
  marital_status?: string | null; address?: string | null;
  emergency_contact?: string | null; aadhar_number?: string | null;
  pan_number?: string | null; bank_name?: string | null;
  account_number?: string | null; ifsc_code?: string | null;
  date_of_joining?: string | null; employment_type?: string | null;
}

type ExportTab = "employees" | "recruiters";

function convertToCSV(data: Record<string, string>[]): string {
  if (data.length === 0) return "";
  const headers = Object.keys(data[0]);
  const csvRows = [
    headers.join(","),
    ...data.map((row) =>
      headers.map((header) => {
        const val = row[header] ?? "";
        // Escape quotes and wrap in quotes if contains comma or quote
        const escaped = String(val).replace(/"/g, '""');
        return escaped.includes(",") || escaped.includes('"') || escaped.includes("\n")
          ? `"${escaped}"`
          : escaped;
      }).join(",")
    ),
  ];
  return csvRows.join("\n");
}

function downloadCSV(csvContent: string, filename: string) {
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export default function ExportScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const c = colors.light;
  const [activeTab, setActiveTab] = useState<ExportTab>("employees");
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const { data: allEmployees, isLoading: loadingEmployees } = useQuery<Employee[]>({
    queryKey: ["employees"],
    queryFn: () => apiFetch("/employees"),
  });

  const employees = useMemo(() => {
    if (!allEmployees) return [];
    return allEmployees.filter((e) => e.role === "employee" || !e.role);
  }, [allEmployees]);

  const recruiters = useMemo(() => {
    if (!allEmployees) return [];
    return allEmployees.filter((e) => e.role === "recruiter");
  }, [allEmployees]);

  const filteredData = useMemo(() => {
    const data = activeTab === "employees" ? employees : recruiters;
    if (!search.trim()) return data;
    const s = search.toLowerCase();
    return data.filter((item) =>
      item.full_name.toLowerCase().includes(s) ||
      item.employee_code?.toLowerCase().includes(s) ||
      item.designation?.toLowerCase().includes(s) ||
      item.workplace?.name?.toLowerCase().includes(s)
    );
  }, [activeTab, employees, recruiters, search]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredData.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredData.map((item) => item.id)));
    }
  };

  const handleExport = () => {
    const selectedData = filteredData.filter((item) => selectedIds.has(item.id));
    if (selectedData.length === 0) {
      alert("Please select at least one item to export");
      return;
    }

    const exportRows = selectedData.map((item) => ({
      "Employee Code": item.employee_code ?? "",
      "Full Name": item.full_name ?? "",
      "Designation": item.designation ?? "",
      "Gender": item.gender ?? "",
      "DOB": item.dob ?? "",
      "Blood Group": item.blood_group ?? "",
      "Qualification": item.qualification ?? "",
      "Marital Status": item.marital_status ?? "",
      "Email": item.email ?? "",
      "Contact Number": item.contact_number ?? "",
      "Address": item.address ?? "",
      "Emergency Contact": item.emergency_contact ?? "",
      "Workplace": item.workplace?.name ?? "",
      "Employment Status": item.employment_status ?? "",
      "Employment Type": item.employment_type ?? "",
      "Date of Joining": item.date_of_joining ?? "",
      "Aadhar Number": item.aadhar_number ?? "",
      "PAN Number": item.pan_number ?? "",
      "Bank Name": item.bank_name ?? "",
      "Account Number": item.account_number ?? "",
      "IFSC Code": item.ifsc_code ?? "",
    }));

    const csv = convertToCSV(exportRows);
    const filename = `${activeTab}_export_${new Date().toISOString().split("T")[0]}.csv`;
    downloadCSV(csv, filename);
  };

  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <NavHeader title="Export Data" showBack onBack={() => router.replace("/(admin)/dashboard")} />

      {/* Tab Switcher */}
      <View style={styles.tabContainer}>
        {[
          { key: "employees" as ExportTab, label: "Employees" },
          { key: "recruiters" as ExportTab, label: "Recruiters" },
        ].map((tab) => (
          <TouchableOpacity
            key={tab.key}
            onPress={() => {
              setActiveTab(tab.key);
              setSelectedIds(new Set());
              setSearch("");
            }}
            style={[
              styles.tab,
              { backgroundColor: activeTab === tab.key ? c.navy : c.muted },
            ]}
          >
            <Text
              style={[
                styles.tabText,
                { color: activeTab === tab.key ? c.white : c.mutedForeground, fontFamily: "Inter_500Medium" },
              ]}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Search */}
      <View style={[styles.searchWrap, { backgroundColor: c.white, borderColor: c.border }]}>
        <Feather name="search" size={16} color={c.mutedForeground} />
        <TextInput
          style={[styles.searchInput, { color: c.text, fontFamily: "Inter_400Regular" }]}
          value={search}
          onChangeText={setSearch}
          placeholder={`Search ${activeTab}...`}
          placeholderTextColor={c.mutedForeground}
        />
        {search ? (
          <TouchableOpacity onPress={() => setSearch("")}>
            <Feather name="x" size={16} color={c.mutedForeground} />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Select All */}
      <TouchableOpacity onPress={toggleSelectAll} style={[styles.selectAllBtn, { backgroundColor: c.white }]}>
        <Feather
          name={selectedIds.size === filteredData.length && filteredData.length > 0 ? "check-square" : "square"}
          size={18}
          color={c.navy}
        />
        <Text style={[styles.selectAllText, { color: c.navy, fontFamily: "Inter_600SemiBold" }]}>
          {selectedIds.size === filteredData.length && filteredData.length > 0
            ? `Deselect All (${selectedIds.size})`
            : `Select All (${filteredData.length})`}
        </Text>
      </TouchableOpacity>

      {/* List */}
      <FlatList
        data={filteredData}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          const isSelected = selectedIds.has(item.id);
          return (
            <TouchableOpacity
              onPress={() => toggleSelect(item.id)}
              style={[
                styles.itemRow,
                { backgroundColor: c.white, borderColor: c.border },
                isSelected && { borderColor: c.navy, backgroundColor: "#EFF6FF" },
              ]}
            >
              <View style={[styles.checkbox, { borderColor: isSelected ? c.navy : c.border, backgroundColor: isSelected ? c.navy : c.white }]}>
                {isSelected && <Feather name="check" size={14} color={c.white} />}
              </View>
              <View style={styles.itemInfo}>
                <Text style={[styles.itemName, { color: c.text, fontFamily: "Inter_600SemiBold" }]}>
                  {item.full_name}
                </Text>
                <Text style={[styles.itemSub, { color: c.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                  {item.employee_code} · {item.designation ?? "—"} · {item.workplace?.name ?? "—"}
                </Text>
              </View>
              <Feather
                name={isSelected ? "check-circle" : "circle"}
                size={20}
                color={isSelected ? c.navy : c.mutedForeground}
              />
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          loadingEmployees ? (
            <LoadingScreen />
          ) : (
            <EmptyState icon="inbox" title={`No ${activeTab} found`} subtitle="Try a different search" />
          )
        }
        contentContainerStyle={{ padding: 16, paddingBottom: bottomPad + 100 }}
      />

      {/* Export Button */}
      {selectedIds.size > 0 && (
        <View style={[styles.bottomBar, { backgroundColor: c.white, paddingBottom: bottomPad + 8 }]}>
          <Text style={[styles.selectedCount, { color: c.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            {selectedIds.size} selected
          </Text>
          <TouchableOpacity onPress={handleExport} style={[styles.exportBtn, { backgroundColor: c.navy }]}>
            <Feather name="download" size={16} color={c.white} />
            <Text style={[styles.exportBtnText, { color: c.white, fontFamily: "Poppins_700Bold" }]}>
              Export to Excel
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  tabContainer: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingTop: 12 },
  tab: { flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: 8 },
  tabText: { fontSize: 14 },
  searchWrap: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, margin: 16, marginBottom: 8 },
  searchInput: { flex: 1, fontSize: 14 },
  selectAllBtn: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 16, marginBottom: 8, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: "#E5E7EB" },
  selectAllText: { fontSize: 14 },
  itemRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, marginHorizontal: 16, marginBottom: 8, borderRadius: 10, borderWidth: 1 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, justifyContent: "center", alignItems: "center" },
  itemInfo: { flex: 1 },
  itemName: { fontSize: 14 },
  itemSub: { fontSize: 12, marginTop: 2 },
  bottomBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: "#E5E7EB" },
  selectedCount: { fontSize: 14 },
  exportBtn: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 8 },
  exportBtnText: { fontSize: 14 },
});