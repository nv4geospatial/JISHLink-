import React, { useState, useCallback, useMemo } from "react";
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, Platform, RefreshControl, ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { NavHeader } from "@/components/NavHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyState } from "@/components/EmptyState";
import { LoadingScreen } from "@/components/LoadingScreen";
import colors from "@/constants/colors";

interface Workplace { id: string; name: string; client_name?: string | null; }
interface Employee {
  id: string; full_name: string; designation?: string | null;
  employment_status?: string | null; workplace?: { name: string } | null;
  employee_code: string; role?: string | null;
  custom_id?: string | null;
  reporting_manager_id?: string | null;
  workplace_id?: string | null;
}
interface Recruiter {
  id: string; full_name: string; designation?: string | null;
  workplace_id?: string | null;
  workplace?: { name: string } | null;
}

export default function AdminDashboard() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const c = colors.light;
  const [search, setSearch] = useState("");
  const [selectedWorkplace, setSelectedWorkplace] = useState<string | "all">("all");
  const [expandedRecruiter, setExpandedRecruiter] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const { data: workplaces } = useQuery<Workplace[]>({
    queryKey: ["workplaces"],
    queryFn: () => apiFetch("/workplaces"),
  });

  const { data: allEmployees, isLoading, refetch: refetchEmp } = useQuery<Employee[]>({
    queryKey: ["employees"],
    queryFn: () => apiFetch("/employees"),
  });

  interface DashboardStats {
    total_employees: number;
    active_employees: number;
    pending_approvals: number;
    today_sign_ins: number;
    absent_today: number;
    unread_notifications: number;
  }

  const { data: stats, refetch: refetchStats } = useQuery<DashboardStats>({
    queryKey: ["admin-dashboard"],
    queryFn: () => apiFetch("/dashboard/admin"),
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchStats(), refetchEmp()]);
    setRefreshing(false);
  }, []);

  // Group data
  const groupedData = useMemo(() => {
    if (!allEmployees) return [];
    
    const recruiters = allEmployees.filter((e) => e.role === "recruiter");
    const employees = allEmployees.filter((e) => e.role === "employee" || !e.role);
    
    // Filter by workplace
    let filteredRecruiters = recruiters;
    if (selectedWorkplace !== "all") {
      filteredRecruiters = recruiters.filter((r) => r.workplace_id === selectedWorkplace);
    }
    
    // Build recruiter-employee mapping
    const recruiterData = filteredRecruiters.map((recruiter) => {
      const recruiterEmployees = employees.filter((e) => 
        e.reporting_manager_id === recruiter.id &&
        (selectedWorkplace === "all" || e.workplace?.name === workplaces?.find((w) => w.id === selectedWorkplace)?.name)
      );
      return { ...recruiter, employees: recruiterEmployees };
    });
    
    // Filter by search (recruiter name OR employee name)
    if (search.trim()) {
      const s = search.toLowerCase();
      return recruiterData.filter((r) => {
        // Include if recruiter name matches
        if (r.full_name.toLowerCase().includes(s)) return true;
        // Include if any employee under this recruiter matches
        return r.employees.some((e) => e.full_name.toLowerCase().includes(s));
      }).map((r) => ({
        ...r,
        // Highlight: only show matching employees when searching
        employees: r.full_name.toLowerCase().includes(s) 
          ? r.employees // Show all if recruiter matches
          : r.employees.filter((e) => e.full_name.toLowerCase().includes(s)), // Only matching employees
      }));
    }
    
    return recruiterData;
  }, [allEmployees, selectedWorkplace, search, workplaces]);

  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const nonAdminEmployees = allEmployees?.filter((e) => e.role !== "admin") ?? [];
  
  const statCards = [
    { label: "Total", value: nonAdminEmployees.length, icon: "users", color: c.navy },
    { label: "Active", value: nonAdminEmployees.filter((e) => e.employment_status === "active").length, icon: "check-circle", color: c.success },
    { label: "Recruiters", value: nonAdminEmployees.filter((e) => e.role === "recruiter").length, icon: "user-check", color: c.teal },
  ];

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <NavHeader
        title="JISHLink"
        subtitle={user ? `${user.full_name} · ${user.workplace?.name ?? "Admin"}` : "Admin Dashboard"}
        rightIcon={<Feather name="bell" size={22} color={c.white} />}
        notificationCount={stats?.unread_notifications}
        onRightPress={() => router.push("/(admin)/notifications")}
        rightIcon2={<Feather name="log-out" size={22} color={c.white} />}
        onRightPress2={async () => {
          await logout();
          router.replace("/(auth)/login");
        }}
      />

      <FlatList
        data={groupedData}
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

            {/* Notification preview */}
            {stats?.unread_notifications && stats.unread_notifications > 0 ? (
              <TouchableOpacity
                onPress={() => router.push("/(admin)/notifications")}
                style={[styles.notifPreview, { backgroundColor: c.white }]}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Feather name="bell" size={18} color={c.warning} />
                  <Text style={[styles.notifPreviewText, { color: c.text, fontFamily: "Inter_600SemiBold" }]}>
                    {stats.unread_notifications} unread notification{stats.unread_notifications > 1 ? "s" : ""}
                  </Text>
                </View>
                <Feather name="chevron-right" size={16} color={c.mutedForeground} />
              </TouchableOpacity>
            ) : null}

            {/* Action buttons - 2 rows on mobile */}
            <View style={styles.actions}>
              {[
                { icon: "user-plus", label: "Add Emp", onPress: () => router.push("/(admin)/employees/add") },
                { icon: "users", label: "Add Rec", onPress: () => router.push("/(admin)/recruiters/add") },
                { icon: "upload", label: "Imp Emp", onPress: () => router.push("/(admin)/import-employees") },
                { icon: "user-check", label: "Imp Rec", onPress: () => router.push("/(admin)/import-recruiters") },
              ].map((a) => (
                <TouchableOpacity
                  key={a.label}
                  style={[styles.actionBtn, { backgroundColor: c.navy }]}
                  onPress={a.onPress}
                >
                  <Feather name={a.icon as any} size={18} color={c.white} />
                  <Text style={[styles.actionLabel, { color: c.gold, fontFamily: "Inter_500Medium" }]}>{a.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.actions}>
              {[
                { icon: "download", label: "Export", onPress: () => router.push("/(admin)/export") },
                { icon: "inbox", label: "Queue", onPress: () => router.push("/(admin)/review-queue") },
                { icon: "grid" as any, label: "QR", onPress: () => router.push("/(admin)/qr-settings") },
              ].map((a) => (
                <TouchableOpacity
                  key={a.label}
                  style={[styles.actionBtn, { backgroundColor: c.navy }]}
                  onPress={a.onPress}
                >
                  <Feather name={a.icon as any} size={18} color={c.white} />
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
                placeholder="Search recruiters or employees..."
                placeholderTextColor={c.mutedForeground}
              />
              {search ? <TouchableOpacity onPress={() => setSearch("")}><Feather name="x" size={16} color={c.mutedForeground} /></TouchableOpacity> : null}
            </View>

            {/* Workplace tabs */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              <View style={{ flexDirection: "row", gap: 8, paddingBottom: 4 }}>
                <TouchableOpacity
                  onPress={() => setSelectedWorkplace("all")}
                  style={[styles.workplaceTab, { backgroundColor: selectedWorkplace === "all" ? c.navy : c.muted }]}
                >
                  <Text style={[styles.workplaceTabText, { color: selectedWorkplace === "all" ? c.white : c.mutedForeground, fontFamily: "Inter_500Medium" }]}>
                    All Workplaces
                  </Text>
                </TouchableOpacity>
                {(workplaces ?? []).map((w) => (
                  <TouchableOpacity
                    key={w.id}
                    onPress={() => setSelectedWorkplace(w.id)}
                    style={[styles.workplaceTab, { backgroundColor: selectedWorkplace === w.id ? c.navy : c.muted }]}
                  >
                    <Text style={[styles.workplaceTabText, { color: selectedWorkplace === w.id ? c.white : c.mutedForeground, fontFamily: "Inter_500Medium" }]}>
                      {w.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <Text style={[styles.sectionTitle, { color: c.navy, fontFamily: "Poppins_700Bold" }]}>
              Recruiters & Teams ({groupedData.length})
            </Text>
          </View>
        }
        renderItem={({ item: recruiter }) => {
          const isExpanded = expandedRecruiter === recruiter.id;
          return (
            <View style={[styles.recruiterCard, { backgroundColor: c.white }]}>
              {/* Recruiter Header */}
              <TouchableOpacity
                onPress={() => setExpandedRecruiter(isExpanded ? null : recruiter.id)}
                style={styles.recruiterHeader}
              >
                <View style={[styles.avatar, { backgroundColor: c.teal }]}>
                  <Text style={[styles.avatarText, { color: c.white, fontFamily: "Poppins_700Bold" }]}>
                    {recruiter.full_name.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.recruiterName, { color: c.text, fontFamily: "Inter_600SemiBold" }]}>{recruiter.full_name}</Text>
                  <Text style={[styles.recruiterSub, { color: c.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                    {recruiter.custom_id ?? recruiter.employee_code} · {recruiter.designation ?? "Recruiter"} · {recruiter.workplace?.name ?? "No workplace"} · Team: {recruiter.employees.length}
                  </Text>
                </View>
                <Feather name={isExpanded ? "chevron-up" : "chevron-down"} size={20} color={c.navy} />
              </TouchableOpacity>

              {/* Recruiter Actions */}
              <View style={styles.recruiterActions}>
                <TouchableOpacity
                  onPress={() => router.push({ pathname: `/(admin)/recruiters/${recruiter.id}` } as any)}
                  style={[styles.recruiterActionBtn, { backgroundColor: c.navy }]}
                >
                  <Feather name="user" size={14} color={c.white} />
                  <Text style={[styles.recruiterActionText, { color: c.white, fontFamily: "Inter_500Medium" }]}>View Profile</Text>
                </TouchableOpacity>
              </View>

              {/* Employees List */}
              {isExpanded && (
                <View style={styles.employeesList}>
                  {recruiter.employees.length === 0 ? (
                    <Text style={[styles.noEmployees, { color: c.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                      No employees assigned
                    </Text>
                  ) : (
                    recruiter.employees.map((emp) => (
                      <TouchableOpacity
                        key={emp.id}
                        style={[styles.employeeRow, { borderBottomColor: c.border }]}
                        onPress={() => router.push(`/(admin)/employees/${emp.id}`)}
                      >
                        <View style={[styles.empAvatar, { backgroundColor: c.muted }]}>
                          <Text style={[styles.empAvatarText, { color: c.navy, fontFamily: "Poppins_700Bold" }]}>
                            {emp.full_name.charAt(0).toUpperCase()}
                          </Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.empName, { color: c.text, fontFamily: "Inter_500Medium" }]}>{emp.full_name}</Text>
                          <Text style={[styles.empSub, { color: c.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                            {emp.designation ?? "—"} · {emp.employee_code}
                          </Text>
                        </View>
                        <StatusBadge status={emp.employment_status ?? "pending"} />
                        <Feather name="chevron-right" size={16} color={c.mutedForeground} />
                      </TouchableOpacity>
                    ))
                  )}
                </View>
              )}
            </View>
          );
        }}
        ListEmptyComponent={isLoading ? <LoadingScreen /> : <EmptyState icon="users" title="No recruiters found" />}
        contentContainerStyle={{ paddingBottom: bottomPad + 16 }}
        showsVerticalScrollIndicator={true}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  listHeader: { padding: 16 },
  statsRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  statCard: { flex: 1, alignItems: "center", padding: 10, borderRadius: 10, gap: 4, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  statValue: { fontSize: 20 },
  statLabel: { fontSize: 10 },
  actions: { flexDirection: "row", gap: 8, marginBottom: 8 },
  actionBtn: { flex: 1, minWidth: 0, alignItems: "center", paddingVertical: 10, borderRadius: 8, gap: 4 },
  actionLabel: { fontSize: 10, textAlign: "center" },
  searchWrap: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12 },
  searchInput: { flex: 1, fontSize: 14 },
  workplaceTab: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, marginRight: 8 },
  workplaceTabText: { fontSize: 13 },
  sectionTitle: { fontSize: 16, marginBottom: 8 },
  recruiterCard: { borderRadius: 12, padding: 14, marginHorizontal: 16, marginBottom: 12, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  recruiterHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22, justifyContent: "center", alignItems: "center" },
  avatarText: { fontSize: 18 },
  recruiterName: { fontSize: 15 },
  recruiterSub: { fontSize: 12, marginTop: 2 },
  recruiterActions: { flexDirection: "row", gap: 10, marginTop: 10, marginBottom: 8 },
  recruiterActionBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  recruiterActionText: { fontSize: 12 },
  employeesList: { marginTop: 8, borderTopWidth: 1, borderTopColor: "#F3F4F6", paddingTop: 8 },
  employeeRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderBottomWidth: 1 },
  empAvatar: { width: 36, height: 36, borderRadius: 18, justifyContent: "center", alignItems: "center" },
  empAvatarText: { fontSize: 14 },
  empName: { fontSize: 14 },
  empSub: { fontSize: 11, marginTop: 1 },
  noEmployees: { fontSize: 13, textAlign: "center", paddingVertical: 12, fontStyle: "italic" },
  notifPreview: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 14, borderRadius: 10, marginBottom: 12, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  notifPreviewText: { fontSize: 14 },
});