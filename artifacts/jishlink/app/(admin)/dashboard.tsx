import React, { useState, useCallback } from "react";
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, Platform, RefreshControl, ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import Toast from "react-native-toast-message";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { NavHeader } from "@/components/NavHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyState } from "@/components/EmptyState";
import { LoadingScreen } from "@/components/LoadingScreen";
import colors from "@/constants/colors";

interface DashboardStats { total_employees: number; active_employees: number; pending_approvals: number; today_sign_ins: number; absent_today: number; unread_notifications: number; }
interface Employee { id: string; full_name: string; designation?: string | null; employment_status?: string | null; workplace?: { name: string } | null; employee_code: string; }

const FILTERS = ["All", "active", "pending", "inactive"];

export default function AdminDashboard() {
  const { logout } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const c = colors.light;
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");
  const [refreshing, setRefreshing] = useState(false);

  const { data: stats, refetch: refetchStats } = useQuery<DashboardStats>({
    queryKey: ["admin-dashboard"],
    queryFn: () => apiFetch("/dashboard/admin"),
  });

  const { data: employees, isLoading, refetch: refetchEmp } = useQuery<Employee[]>({
    queryKey: ["employees", search, filter],
    queryFn: () => apiFetch(`/employees?${new URLSearchParams({
      ...(search ? { search } : {}),
      ...(filter !== "All" ? { status: filter } : {}),
    }).toString()}`),
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchStats(), refetchEmp()]);
    setRefreshing(false);
  }, []);

  const statCards = [
    { label: "Total", value: stats?.total_employees ?? 0, icon: "users", color: c.navy },
    { label: "Active", value: stats?.active_employees ?? 0, icon: "check-circle", color: c.success },
    { label: "Pending", value: stats?.pending_approvals ?? 0, icon: "clock", color: c.warning },
    { label: "Today In", value: stats?.today_sign_ins ?? 0, icon: "log-in", color: c.teal },
    { label: "Absent", value: stats?.absent_today ?? 0, icon: "x-circle", color: c.destructive },
  ];

  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <NavHeader
        title="Dashboard"
        rightIcon={<Feather name="bell" size={22} color={c.white} />}
        notificationCount={stats?.unread_notifications}
        onRightPress={() => router.push("/(admin)/notifications")}
      />

      <FlatList
        data={employees ?? []}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.navy} />}
        ListHeaderComponent={
          <View style={styles.listHeader}>
            {/* Stat cards */}
            <View style={styles.statsRow}>
              {statCards.map((s) => (
                <View key={s.label} style={[styles.statCard, { backgroundColor: c.white }]}>
                  <Feather name={s.icon as any} size={20} color={s.color} />
                  <Text style={[styles.statValue, { color: s.color, fontFamily: "Poppins_700Bold" }]}>{s.value}</Text>
                  <Text style={[styles.statLabel, { color: c.mutedForeground, fontFamily: "Inter_400Regular" }]}>{s.label}</Text>
                </View>
              ))}
            </View>

            {/* Action buttons */}
            <View style={styles.actions}>
              {[
                { icon: "user-plus", label: "Add", onPress: () => router.push("/(admin)/employees/add") },
                { icon: "upload", label: "Import", onPress: () => router.push("/(admin)/import") },
                { icon: "inbox", label: "Queue", onPress: () => router.push("/(admin)/review-queue") },
                { icon: "qr-code" as any, label: "QR", onPress: () => router.push("/(admin)/qr-settings") },
                { icon: "bar-chart-2", label: "Recruiters", onPress: () => router.push("/(admin)/recruiter-oversight") },
              ].map((a) => (
                <TouchableOpacity
                  key={a.label}
                  style={[styles.actionBtn, { backgroundColor: c.navy }]}
                  onPress={a.onPress}
                >
                  <Feather name={a.icon as any} size={20} color={c.white} />
                  <Text style={[styles.actionLabel, { color: c.gold, fontFamily: "Inter_500Medium" }]}>{a.label}</Text>
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
                placeholder="Search employees..."
                placeholderTextColor={c.mutedForeground}
              />
              {search ? <TouchableOpacity onPress={() => setSearch("")}><Feather name="x" size={16} color={c.mutedForeground} /></TouchableOpacity> : null}
            </View>

            {/* Filters */}
            <View style={styles.filterRow}>
              {FILTERS.map((f) => (
                <TouchableOpacity
                  key={f}
                  onPress={() => setFilter(f)}
                  style={[styles.filterChip, { backgroundColor: filter === f ? c.navy : c.muted }]}
                >
                  <Text style={[styles.filterText, { color: filter === f ? c.white : c.mutedForeground, fontFamily: "Inter_500Medium" }]}>
                    {f.charAt(0).toUpperCase() + f.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity onPress={logout} style={[styles.filterChip, { backgroundColor: c.destructive, marginLeft: "auto" }]}>
                <Feather name="log-out" size={14} color={c.white} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.sectionTitle, { color: c.navy, fontFamily: "Poppins_700Bold" }]}>
              Employees ({employees?.length ?? 0})
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.empRow, { backgroundColor: c.white }]}
            onPress={() => router.push(`/(admin)/employees/${item.id}`)}
          >
            <View style={[styles.avatar, { backgroundColor: c.muted }]}>
              <Text style={[styles.avatarText, { color: c.navy, fontFamily: "Poppins_700Bold" }]}>
                {item.full_name.charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.empName, { color: c.text, fontFamily: "Inter_600SemiBold" }]}>{item.full_name}</Text>
              <Text style={[styles.empSub, { color: c.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                {item.designation ?? "—"} · {item.workplace?.name ?? "No workplace"}
              </Text>
            </View>
            <StatusBadge status={item.employment_status ?? "pending"} />
          </TouchableOpacity>
        )}
        ListEmptyComponent={isLoading ? <LoadingScreen /> : <EmptyState icon="users" title="No employees found" />}
        contentContainerStyle={{ paddingBottom: bottomPad + 16 }}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  listHeader: { padding: 16 },
  statsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
  statCard: { flex: 1, minWidth: 64, alignItems: "center", padding: 10, borderRadius: 10, gap: 4, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  statValue: { fontSize: 20 },
  statLabel: { fontSize: 10 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
  actionBtn: { flex: 1, minWidth: 56, alignItems: "center", paddingVertical: 10, borderRadius: 8, gap: 4 },
  actionLabel: { fontSize: 11 },
  searchWrap: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12 },
  searchInput: { flex: 1, fontSize: 14 },
  filterRow: { flexDirection: "row", gap: 8, marginBottom: 16, flexWrap: "wrap" },
  filterChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, justifyContent: "center", alignItems: "center" },
  filterText: { fontSize: 13 },
  sectionTitle: { fontSize: 16, marginBottom: 8 },
  empRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, marginHorizontal: 16, marginBottom: 8, borderRadius: 10, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  avatar: { width: 42, height: 42, borderRadius: 21, justifyContent: "center", alignItems: "center" },
  avatarText: { fontSize: 18 },
  empName: { fontSize: 15 },
  empSub: { fontSize: 12, marginTop: 2 },
});
