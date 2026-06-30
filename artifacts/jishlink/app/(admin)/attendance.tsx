import React, { useState, useCallback } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, RefreshControl, Platform, Switch,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import { apiFetch } from "@/lib/api";
import { NavHeader } from "@/components/NavHeader";
import { EmptyState } from "@/components/EmptyState";
import { LoadingScreen } from "@/components/LoadingScreen";
import Toast from "react-native-toast-message";
import colors from "@/constants/colors";

interface AttendanceRecord {
  employee_id: string;
  employee_name: string;
  date: string;
  login_time?: string | null;
  login_address?: string | null;
  signoff_time?: string | null;
  signoff_address?: string | null;
  status: "present" | "absent" | "late" | "early_exit";
  shift_start?: string | null;
  shift_end?: string | null;
}

interface Employee {
  id: string; full_name: string; designation?: string | null;
}

export default function AttendanceTrackingScreen() {
  const insets = useSafeAreaInsets();
  const c = colors.light;
  const [refreshing, setRefreshing] = useState(false);
  
  // Date filters
  const today = new Date().toISOString().split("T")[0];
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);
  const [allDates, setAllDates] = useState(false);
  
  // Employee filters
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>([]);
  const [allEmployees, setAllEmployees] = useState(true);
  
  // Export state
  const [exporting, setExporting] = useState(false);

  const { data: employees } = useQuery<Employee[]>({
    queryKey: ["recruiter-employees"],
    queryFn: () => apiFetch("/employees"),
  });

  const { data: attendance, isLoading, refetch } = useQuery<AttendanceRecord[]>({
    queryKey: ["attendance-tracking", allDates, fromDate, toDate, allEmployees, selectedEmployees],
    queryFn: () => {
      const params = new URLSearchParams();
      if (!allDates) {
        if (fromDate) params.append("from_date", fromDate);
        if (toDate) params.append("to_date", toDate);
      }
      if (!allEmployees && selectedEmployees.length > 0) {
        params.append("employee_ids", selectedEmployees.join(","));
      }
      const queryString = params.toString();
      return apiFetch(`/attendance/tracking${queryString ? "?" + queryString : ""}`);
    },
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const toggleEmployee = (empId: string) => {
    setSelectedEmployees((prev) => {
      const exists = prev.includes(empId);
      let next: string[];
      if (exists) {
        next = prev.filter((id) => id !== empId);
      } else {
        next = [...prev, empId];
      }
      // If any individual selected, uncheck "All"
      if (next.length > 0) setAllEmployees(false);
      // If none selected, check "All"
      if (next.length === 0) setAllEmployees(true);
      return next;
    });
  };

  const toggleAllEmployees = () => {
    setAllEmployees(true);
    setSelectedEmployees([]);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "present": return c.success;
      case "absent": return c.destructive;
      case "late": return c.warning;
      case "early_exit": return c.warning;
      default: return c.mutedForeground;
    }
  };

  const exportToExcel = async () => {
    if (!attendance || attendance.length === 0) {
      Toast.show({ type: "error", text1: "No data to export" });
      return;
    }
    
    setExporting(true);
    try {
      const data = attendance.map((r) => ({
        "Employee Name": r.employee_name,
        "Date": r.date,
        "Status": r.status.toUpperCase(),
        "Login Time": r.login_time
          ? new Date(r.login_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
          : "-",
        "Login Address": r.login_address || "-",
        "Signoff Time": r.signoff_time
          ? new Date(r.signoff_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
          : "-",
        "Signoff Address": r.signoff_address || "-",
        "Shift": r.shift_start && r.shift_end ? `${r.shift_start} - ${r.shift_end}` : "-",
      }));

      const worksheet = XLSX.utils.json_to_sheet(data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Attendance");
      
      worksheet["!cols"] = [
        { wch: 20 }, { wch: 12 }, { wch: 10 },
        { wch: 12 }, { wch: 25 }, { wch: 12 }, { wch: 25 }, { wch: 15 },
      ];

      const wbout = XLSX.write(workbook, { bookType: "xlsx", type: "base64" });
      const filename = `Attendance_${new Date().toISOString().split("T")[0]}.xlsx`;

      if (Platform.OS === "web") {
        const byteChars = atob(wbout);
        const byteNumbers = new Array(byteChars.length);
        for (let i = 0; i < byteChars.length; i++) {
          byteNumbers[i] = byteChars.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        Toast.show({ type: "success", text1: "Excel downloaded!" });
      } else {
        const fileUri = (FileSystem.cacheDirectory ?? "") + filename;
        await FileSystem.writeAsStringAsync(fileUri, wbout, {
          encoding: FileSystem.EncodingType.Base64,
        });
        await Sharing.shareAsync(fileUri, {
          dialogTitle: "Export Attendance",
          mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          UTI: "com.microsoft.excel.xlsx",
        });
      }
    } catch (err) {
      Toast.show({ type: "error", text1: "Export failed" });
    } finally {
      setExporting(false);
    }
  };

  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <NavHeader title="Attendance Tracking" showBack />

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.navy} />}
        contentContainerStyle={{ padding: 16, paddingBottom: bottomPad + 32 }}
      >
        {/* ── Filters Section ── */}
        <View style={[styles.section, { backgroundColor: c.white }]}>
          <Text style={[styles.sectionTitle, { color: c.navy, fontFamily: "Poppins_700Bold" }]}>
            Filters
          </Text>

          {/* Date Range */}
          <View style={styles.dateRow}>
            <View style={styles.dateField}>
              <Text style={[styles.label, { color: c.mutedForeground }]}>From Date</Text>
              <TextInput
                style={[styles.dateInput, { 
                  borderColor: allDates ? c.muted : c.border, 
                  backgroundColor: allDates ? c.muted : c.offwhite,
                  color: allDates ? c.mutedForeground : c.text,
                }]}
                value={fromDate}
                onChangeText={setFromDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={c.mutedForeground}
                editable={!allDates}
              />
            </View>
            <View style={styles.dateField}>
              <Text style={[styles.label, { color: c.mutedForeground }]}>To Date</Text>
              <TextInput
                style={[styles.dateInput, { 
                  borderColor: allDates ? c.muted : c.border, 
                  backgroundColor: allDates ? c.muted : c.offwhite,
                  color: allDates ? c.mutedForeground : c.text,
                }]}
                value={toDate}
                onChangeText={setToDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={c.mutedForeground}
                editable={!allDates}
              />
            </View>
            <View style={styles.allDatesToggle}>
              <Text style={[styles.label, { color: c.mutedForeground }]}>All Dates</Text>
              <Switch
                value={allDates}
                onValueChange={setAllDates}
                trackColor={{ false: c.muted, true: c.gold }}
                thumbColor={allDates ? c.navy : c.white}
              />
            </View>
          </View>

          {/* Employee Filter */}
          <View style={styles.empFilterSection}>
            <View style={styles.empFilterHeader}>
              <Text style={[styles.label, { color: c.mutedForeground }]}>Employees</Text>
              <TouchableOpacity onPress={exportToExcel} disabled={exporting || isLoading} style={[styles.exportBtn, { backgroundColor: c.gold, opacity: exporting || isLoading ? 0.6 : 1 }]} activeOpacity={0.7}>
                <Feather name="download" size={14} color={c.navy} />
                <Text style={[styles.exportBtnText, { color: c.navy, fontFamily: "Poppins_600SemiBold" }]}>
                  {exporting ? "Exporting..." : "Export"}
                </Text>
              </TouchableOpacity>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.empFilterRow}>
                <TouchableOpacity
                  onPress={toggleAllEmployees}
                  style={[styles.empFilterChip, { backgroundColor: allEmployees ? c.navy : c.muted }]}
                >
                  <Text style={{ color: allEmployees ? c.white : c.mutedForeground, fontFamily: "Inter_500Medium" }}>
                    All Employees
                  </Text>
                </TouchableOpacity>
                {(employees ?? []).map((emp) => {
                  const isSelected = selectedEmployees.includes(emp.id);
                  return (
                    <TouchableOpacity
                      key={emp.id}
                      onPress={() => toggleEmployee(emp.id)}
                      style={[styles.empFilterChip, { backgroundColor: isSelected ? c.navy : c.muted }]}
                    >
                      <Text style={{ color: isSelected ? c.white : c.mutedForeground, fontFamily: "Inter_500Medium" }}>
                        {emp.full_name}
                      </Text>
                      {isSelected && (
                        <Feather name="check" size={12} color={c.white} style={{ marginLeft: 4 }} />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>
          </View>
        </View>

        {/* ── Attendance Table ── */}
        <View style={[styles.section, { backgroundColor: c.white }]}>
          <Text style={[styles.sectionTitle, { color: c.navy, fontFamily: "Poppins_700Bold" }]}>
            Attendance Report
            {attendance && attendance.length > 0 && (
              <Text style={[styles.recordCount, { color: c.mutedForeground }]}> ({attendance.length} records)</Text>
            )}
          </Text>

          {(attendance ?? []).length === 0 && !isLoading && (
            <EmptyState icon="calendar" title="No attendance records" subtitle="No data found for selected filters" />
          )}
          
          {isLoading && <LoadingScreen />}

          {attendance && attendance.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={true}>
              <View>
                {/* Table Header */}
                <View style={[styles.tableRow, styles.tableHeader, { backgroundColor: c.navy }]}>
                  <Text style={[styles.tableCell, styles.colName, styles.headerText, { color: c.white }]}>Employee</Text>
                  <Text style={[styles.tableCell, styles.colDate, styles.headerText, { color: c.white }]}>Date</Text>
                  <Text style={[styles.tableCell, styles.colStatus, styles.headerText, { color: c.white }]}>Status</Text>
                  <Text style={[styles.tableCell, styles.colTime, styles.headerText, { color: c.white }]}>Login</Text>
                  <Text style={[styles.tableCell, styles.colAddress, styles.headerText, { color: c.white }]}>Login Addr</Text>
                  <Text style={[styles.tableCell, styles.colTime, styles.headerText, { color: c.white }]}>Signoff</Text>
                  <Text style={[styles.tableCell, styles.colAddress, styles.headerText, { color: c.white }]}>Signoff Addr</Text>
                  <Text style={[styles.tableCell, styles.colShift, styles.headerText, { color: c.white }]}>Shift</Text>
                </View>

                {/* Table Body */}
                {attendance.map((record) => (
                  <View key={`${record.employee_id}-${record.date}`} style={[styles.tableRow, { borderBottomColor: c.border, borderBottomWidth: 1 }]}>
                    <Text style={[styles.tableCell, styles.colName, { color: c.text }]} numberOfLines={1}>
                      {record.employee_name}
                    </Text>
                    <Text style={[styles.tableCell, styles.colDate, { color: c.text }]}>{record.date}</Text>
                    <View style={[styles.tableCell, styles.colStatus]}>
                      <View style={[styles.statusBadge, { backgroundColor: getStatusColor(record.status) + "20" }]}>
                        <Text style={[styles.statusText, { color: getStatusColor(record.status) }]}>
                          {record.status.toUpperCase()}
                        </Text>
                      </View>
                    </View>
                    <Text style={[styles.tableCell, styles.colTime, { color: c.text }]}>
                      {record.login_time
                        ? new Date(record.login_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                        : "-"}
                    </Text>
                    <Text style={[styles.tableCell, styles.colAddress, { color: c.mutedForeground }]} numberOfLines={1}>
                      {record.login_address || "-"}
                    </Text>
                    <Text style={[styles.tableCell, styles.colTime, { color: c.text }]}>
                      {record.signoff_time
                        ? new Date(record.signoff_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                        : "-"}
                    </Text>
                    <Text style={[styles.tableCell, styles.colAddress, { color: c.mutedForeground }]} numberOfLines={1}>
                      {record.signoff_address || "-"}
                    </Text>
                    <Text style={[styles.tableCell, styles.colShift, { color: c.text }]}>
                      {record.shift_start && record.shift_end ? `${record.shift_start} - ${record.shift_end}` : "-"}
                    </Text>
                  </View>
                ))}
              </View>
            </ScrollView>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  section: { borderRadius: 10, padding: 16, marginBottom: 12, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  sectionTitle: { fontSize: 15, marginBottom: 12 },
  recordCount: { fontSize: 13, fontFamily: "Inter_400Regular" },
  label: { fontSize: 12, marginBottom: 4, fontFamily: "Inter_500Medium" },
  
  // Date filters
  dateRow: { flexDirection: "row", gap: 10, marginBottom: 16, alignItems: "flex-end" },
  dateField: { flex: 1 },
  dateInput: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, fontFamily: "Inter_400Regular" },
  allDatesToggle: { alignItems: "center", gap: 4 },
  
  // Employee filter
  empFilterSection: { marginTop: 4 },
  empFilterHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  empFilterRow: { flexDirection: "row", gap: 8, paddingVertical: 4 },
  empFilterChip: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  exportBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  exportBtnText: { fontSize: 13 },
  
  // Table
  tableRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10 },
  tableHeader: { borderTopLeftRadius: 8, borderTopRightRadius: 8, paddingVertical: 12 },
  headerText: { fontSize: 12, fontFamily: "Poppins_600SemiBold" },
  tableCell: { paddingHorizontal: 8, fontSize: 12, fontFamily: "Inter_400Regular" },
  colName: { width: 140 },
  colDate: { width: 90 },
  colStatus: { width: 80, alignItems: "center" },
  colTime: { width: 70 },
  colAddress: { width: 160 },
  colShift: { width: 110 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12 },
  statusText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
});