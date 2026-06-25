import React, { useState, useCallback } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, RefreshControl, Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePrefetchQuery, useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { NavHeader } from "@/components/NavHeader";
import { EmptyState } from "@/components/EmptyState";
import { LoadingScreen } from "@/components/LoadingScreen";
import colors from "@/constants/colors";

interface LeaveRecord {
  id: string;
  employee_id: string;
  employee_name: string;
  date: string;
  reason: string;
  notes?: string | null;
  created_at: string;
}

interface EmployeeLeaveSummary {
  employee_id: string;
  employee_name: string;
  total_leaves: number;
  this_month: number;
  this_year: number;
}

export default function LeavesTrackerScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const c = colors.light;
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<"summary" | "details">("summary");

  const { data: leaveSummary, isLoading: summaryLoading, refetch: refetchSummary } = useQuery<EmployeeLeaveSummary[]>({
    queryKey: ["leave-summary"],
    queryFn: () => apiFetch("/absence-notes/summary"),
  });

  const { data: leaveDetails, isLoading: detailsLoading, refetch: refetchDetails } = useQuery<LeaveRecord[]>({
    queryKey: ["leave-details"],
    queryFn: () => apiFetch("/absence-notes/details"),
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchSummary(), refetchDetails()]);
    setRefreshing(false);
  }, [refetchSummary, refetchDetails]);

  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <NavHeader title="Leaves Tracker" showBack />

      {/* Tabs */}
      <View style={styles.tabRow}>
        <TouchableOpacity
          onPress={() => setActiveTab("summary")}
          style={[styles.tab, { backgroundColor: activeTab === "summary" ? c.navy : c.muted }]}
        >
          <Text style={[styles.tabText, { color: activeTab === "summary" ? c.white : c.mutedForeground }]}>Summary</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setActiveTab("details")}
          style={[styles.tab, { backgroundColor: activeTab === "details" ? c.navy : c.muted }]}
        >
          <Text style={[styles.tabText, { color: activeTab === "details" ? c.white : c.mutedForeground }]}>Details</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.navy} />}
        contentContainerStyle={{ padding: 16, paddingBottom: bottomPad + 32 }}
      >
        {activeTab === "summary" ? (
          <View style={[styles.section, { backgroundColor: c.white }]}>
            <Text style={[styles.sectionTitle, { color: c.navy, fontFamily: "Poppins_700Bold" }]}>
              Leave Summary by Employee
            </Text>
            
            {summaryLoading && <LoadingScreen />}
            
            {(leaveSummary ?? []).length === 0 && !summaryLoading && (
              <EmptyState icon="file-text" title="No leave records" />
            )}

            {(leaveSummary ?? []).map((emp) => (
              <View key={emp.employee_id} style={[styles.summaryCard, { backgroundColor: c.offwhite }]}>
                <View style={styles.summaryHeader}>
                  <Text style={[styles.empName, { color: c.text, fontFamily: "Inter_600SemiBold" }]}>
                    {emp.employee_name}
                  </Text>
                  <View style={[styles.totalBadge, { backgroundColor: c.destructive + "20" }]}>
                    <Text style={[styles.totalText, { color: c.destructive, fontFamily: "Poppins_700Bold" }]}>
                      {emp.total_leaves}
                    </Text>
                  </View>
                </View>
                
                <View style={styles.statsRow}>
                  <View style={styles.statBlock}>
                    <Text style={[styles.statValue, { color: c.warning, fontFamily: "Poppins_700Bold" }]}>{emp.this_month}</Text>
                    <Text style={[styles.statLabel, { color: c.mutedForeground }]}>This Month</Text>
                  </View>
                  <View style={styles.statBlock}>
                    <Text style={[styles.statValue, { color: c.navy, fontFamily: "Poppins_700Bold" }]}>{emp.this_year}</Text>
                    <Text style={[styles.statLabel, { color: c.mutedForeground }]}>This Year</Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        ) : (
          <View style={[styles.section, { backgroundColor: c.white }]}>
            <Text style={[styles.sectionTitle, { color: c.navy, fontFamily: "Poppins_700Bold" }]}>
              Leave Details
            </Text>
            
            {detailsLoading && <LoadingScreen />}
            
            {(leaveDetails ?? []).length === 0 && !detailsLoading && (
              <EmptyState icon="file-text" title="No leave details" />
            )}

            {(leaveDetails ?? []).map((leave) => (
              <View key={leave.id} style={[styles.leaveCard, { borderLeftColor: c.warning }]}>
                <View style={styles.leaveHeader}>
                  <Text style={[styles.empName, { color: c.text, fontFamily: "Inter_600SemiBold" }]}>
                    {leave.employee_name}
                  </Text>
                  <Text style={[styles.leaveDate, { color: c.mutedForeground }]}>
                    {leave.date}
                  </Text>
                </View>
                
                <View style={styles.reasonRow}>
                  <Feather name="alert-circle" size={14} color={c.warning} />
                  <Text style={[styles.reasonText, { color: c.text, fontFamily: "Inter_500Medium" }]}>
                    {leave.reason}
                  </Text>
                </View>
                
                {leave.notes && (
                  <Text style={[styles.notesText, { color: c.mutedForeground }]}>
                    Notes: {leave.notes}
                  </Text>
                )}
                
                <Text style={[styles.createdText, { color: c.mutedForeground }]}>
                  Logged on: {new Date(leave.created_at).toLocaleDateString()}
                </Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  tabRow: { flexDirection: "row", padding: 16, gap: 8 },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: "center" },
  tabText: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  section: { borderRadius: 10, padding: 16, marginBottom: 12, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  sectionTitle: { fontSize: 15, marginBottom: 12 },
  summaryCard: { padding: 12, borderRadius: 8, marginBottom: 8 },
  summaryHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  empName: { fontSize: 15 },
  totalBadge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 16 },
  totalText: { fontSize: 18 },
  statsRow: { flexDirection: "row", gap: 16 },
  statBlock: { flex: 1, alignItems: "center" },
  statValue: { fontSize: 20 },
  statLabel: { fontSize: 12, marginTop: 2 },
  leaveCard: { padding: 12, borderRadius: 8, marginBottom: 8, borderLeftWidth: 4, backgroundColor: "#F9FAFB" },
  leaveHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  leaveDate: { fontSize: 12 },
  reasonRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 },
  reasonText: { fontSize: 13, flex: 1 },
  notesText: { fontSize: 12, marginTop: 4, fontStyle: "italic" },
  createdText: { fontSize: 11, marginTop: 4 },
});