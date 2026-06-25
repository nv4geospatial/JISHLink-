import React, { useState, useCallback } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, RefreshControl, Platform, TextInput,
} from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { NavHeader } from "@/components/NavHeader";
import { EmptyState } from "@/components/EmptyState";
import { LoadingScreen } from "@/components/LoadingScreen";
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
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const c = colors.light;
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const [selectedEmployee, setSelectedEmployee] = useState<string | null>(null);

  const { data: employees } = useQuery<Employee[]>({
    queryKey: ["recruiter-employees"],
    queryFn: () => apiFetch("/employees"),
  });

  const { data: attendance, isLoading, refetch } = useQuery<AttendanceRecord[]>({
    queryKey: ["attendance-tracking", selectedDate, selectedEmployee],
    queryFn: () => apiFetch(`/attendance/tracking?date=${selectedDate}${selectedEmployee ? `&employee_id=${selectedEmployee}` : ""}`),
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "present": return c.success;
      case "absent": return c.destructive;
      case "late": return c.warning;
      case "early_exit": return c.warning;
      default: return c.mutedForeground;
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
        {/* Date Filter */}
        <View style={[styles.section, { backgroundColor: c.white }]}>
          <Text style={[styles.sectionTitle, { color: c.navy, fontFamily: "Poppins_700Bold" }]}>Select Date</Text>
          <TextInput
            style={[styles.input, { borderColor: c.border, backgroundColor: c.offwhite, color: c.text }]}
            value={selectedDate}
            onChangeText={setSelectedDate}
            placeholder="YYYY-MM-DD"
          />
        </View>

        {/* Employee Filter */}
        <View style={[styles.section, { backgroundColor: c.white }]}>
          <Text style={[styles.sectionTitle, { color: c.navy, fontFamily: "Poppins_700Bold" }]}>Filter by Employee</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.empFilterRow}>
              <TouchableOpacity
                onPress={() => setSelectedEmployee(null)}
                style={[styles.empFilterChip, { backgroundColor: selectedEmployee === null ? c.navy : c.muted }]}
              >
                <Text style={{ color: selectedEmployee === null ? c.white : c.mutedForeground, fontFamily: "Inter_500Medium" }}>All</Text>
              </TouchableOpacity>
              {(employees ?? []).map((emp) => (
                <TouchableOpacity
                  key={emp.id}
                  onPress={() => setSelectedEmployee(emp.id)}
                  style={[styles.empFilterChip, { backgroundColor: selectedEmployee === emp.id ? c.navy : c.muted }]}
                >
                  <Text style={{ color: selectedEmployee === emp.id ? c.white : c.mutedForeground, fontFamily: "Inter_500Medium" }}>
                    {emp.full_name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>

        {/* Attendance Records */}
        <View style={[styles.section, { backgroundColor: c.white }]}>
          <Text style={[styles.sectionTitle, { color: c.navy, fontFamily: "Poppins_700Bold" }]}>
            Attendance for {selectedDate}
          </Text>
          
          {(attendance ?? []).length === 0 && !isLoading && (
            <EmptyState icon="calendar" title="No attendance records" subtitle="No data found for selected date" />
          )}
          
          {isLoading && <LoadingScreen />}

          {(attendance ?? []).map((record) => (
            <View key={`${record.employee_id}-${record.date}`} style={[styles.recordCard, { borderLeftColor: getStatusColor(record.status) }]}>
              <View style={styles.recordHeader}>
                <Text style={[styles.empName, { color: c.text, fontFamily: "Inter_600SemiBold" }]}>
                  {record.employee_name}
                </Text>
                <View style={[styles.statusBadge, { backgroundColor: getStatusColor(record.status) + "20" }]}>
                  <Text style={[styles.statusText, { color: getStatusColor(record.status), fontFamily: "Inter_600SemiBold" }]}>
                    {record.status.toUpperCase()}
                  </Text>
                </View>
              </View>

              {record.shift_start && (
                <Text style={[styles.shiftText, { color: c.mutedForeground }]}>
                  Shift: {record.shift_start} - {record.shift_end}
                </Text>
              )}

              <View style={styles.timeRow}>
                {record.login_time && (
                  <View style={styles.timeBlock}>
                    <Feather name="log-in" size={14} color={c.success} />
                    <Text style={[styles.timeText, { color: c.text }]}>
                      {new Date(record.login_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </Text>
                    {record.login_address && (
                      <Text style={[styles.addressText, { color: c.mutedForeground }]}>{record.login_address}</Text>
                    )}
                  </View>
                )}
                
                {record.signoff_time && (
                  <View style={styles.timeBlock}>
                    <Feather name="log-out" size={14} color={c.destructive} />
                    <Text style={[styles.timeText, { color: c.text }]}>
                      {new Date(record.signoff_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </Text>
                    {record.signoff_address && (
                      <Text style={[styles.addressText, { color: c.mutedForeground }]}>{record.signoff_address}</Text>
                    )}
                  </View>
                )}
              </View>

              {!record.login_time && !record.signoff_time && (
                <Text style={[styles.noDataText, { color: c.destructive }]}>
                  No login/signoff recorded
                </Text>
              )}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  section: { borderRadius: 10, padding: 16, marginBottom: 12, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  sectionTitle: { fontSize: 15, marginBottom: 12 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, fontFamily: "Inter_400Regular" },
  empFilterRow: { flexDirection: "row", gap: 8, paddingVertical: 4 },
  empFilterChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20 },
  recordCard: { padding: 12, borderRadius: 8, marginBottom: 8, borderLeftWidth: 4, backgroundColor: "#F9FAFB" },
  recordHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  empName: { fontSize: 15 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12 },
  statusText: { fontSize: 11 },
  shiftText: { fontSize: 12, marginBottom: 8 },
  timeRow: { flexDirection: "row", gap: 16 },
  timeBlock: { flex: 1, gap: 4 },
  timeText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  addressText: { fontSize: 11 },
  noDataText: { fontSize: 13, fontFamily: "Inter_500Medium", marginTop: 4 },
});