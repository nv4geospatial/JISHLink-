import React, { useCallback, useState } from "react";
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  RefreshControl, Platform, Linking,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { NavHeader } from "@/components/NavHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyState } from "@/components/EmptyState";
import { LoadingScreen } from "@/components/LoadingScreen";
import colors from "@/constants/colors";

interface EmployeeStatus {
  employee: { 
    id: string; full_name: string; designation?: string | null; 
    contact_number?: string | null; workplace?: { name: string } | null;
    shift_start_time?: string | null; shift_end_time?: string | null;
    shift_days?: string | null;
  };
  logged_in: boolean; signed_off: boolean;
  login_time?: string | null; signoff_time?: string | null; login_address?: string | null;
  shift_status?: string; shift_overdue?: boolean; has_shift_today?: boolean;
  has_absence_note?: boolean;
  has_call_log?: boolean;
}

interface RecruiterDashboard {
  team_count: number; signed_in_today: number; not_signed_in: number;
  shift_overdue_count: number;
  employees: EmployeeStatus[];
}

interface Notification { id: string; read: boolean; }

export default function RecruiterDashboard() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const c = colors.light;
  const [refreshing, setRefreshing] = useState(false);

  const { data, isLoading, refetch } = useQuery<RecruiterDashboard>({
    queryKey: ["recruiter-dashboard"],
    queryFn: () => apiFetch("/dashboard/recruiter"),
    refetchInterval: 30000, // Auto refresh every 30 seconds
  });

  // Refresh when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch])
  );
  const qc = useQueryClient();

  const { data: notifications, refetch: refetchNotif } = useQuery<Notification[]>({
    queryKey: ["notifications"],
    queryFn: () => apiFetch("/notifications"),
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const unread = (notifications ?? []).filter((n) => !n.read).length;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await qc.invalidateQueries({ queryKey: ["recruiter-dashboard"] });
    await qc.refetchQueries({ queryKey: ["recruiter-dashboard"], type: "active" });
    setRefreshing(false);
  }, [qc]);

  const getStatus = (emp: EmployeeStatus): string => {
    if (emp.signed_off) return "signed_off";
    if (emp.logged_in) return "signed_in";
    return "absent";
  };

  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <NavHeader
        title="JISHLink"
        subtitle={user ? `${user.full_name} · ${user.workplace?.name ?? "Recruiter"}` : "My Team"}
        rightIcon={<Feather name="bell" size={22} color={c.white} />}
        notificationCount={unread}
        onRightPress={() => router.push("/(recruiter)/notifications")}
        rightIcon2={<Feather name="log-out" size={22} color={c.white} />}
        onRightPress2={async () => {
          await logout();
          router.replace("/(auth)/login");
        }}
      />

      <FlatList
        data={data?.employees ?? []}
        keyExtractor={(item) => item.employee.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.navy} />}
        ListHeaderComponent={
          <View style={styles.listHeader}>
            {/* Summary cards */}
            <View style={styles.statsRow}>
              {[
                { label: "Team", value: data?.team_count ?? 0, icon: "users", color: c.navy },
                { label: "In Today", value: data?.signed_in_today ?? 0, icon: "check-circle", color: c.success },
                { label: "Absent", value: data?.not_signed_in ?? 0, icon: "x-circle", color: c.destructive },
              ].map((s) => (
                <View key={s.label} style={[styles.statCard, { backgroundColor: c.white }]}>
                  <Feather name={s.icon as any} size={22} color={s.color} />
                  <Text style={[styles.statValue, { color: s.color, fontFamily: "Poppins_700Bold" }]}>{s.value}</Text>
                  <Text style={[styles.statLabel, { color: c.mutedForeground, fontFamily: "Inter_400Regular" }]}>{s.label}</Text>
                </View>
              ))}
            </View>

            <View style={styles.actionRow}>
              <TouchableOpacity onPress={() => router.push("/(recruiter)/employees/add" as any)} style={[styles.actionBtn, { backgroundColor: c.gold }]}>
                <Feather name="user-plus" size={16} color={c.navy} />
                <Text style={[styles.actionText, { color: c.navy, fontFamily: "Inter_600SemiBold" }]}>Add Employee</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => router.push("/(recruiter)/employees" as any)} style={[styles.actionBtn, { backgroundColor: c.teal }]}>
                <Feather name="users" size={16} color={c.white} />
                <Text style={[styles.actionText, { color: c.white, fontFamily: "Inter_600SemiBold" }]}>All Employees</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.actionRow}>
              <TouchableOpacity onPress={() => router.push("/(recruiter)/shifts" as any)} style={[styles.actionBtn, { backgroundColor: c.navy }]}>
                <Feather name="clock" size={16} color={c.white} />
                <Text style={[styles.actionText, { color: c.white, fontFamily: "Inter_600SemiBold" }]}>Manage Shifts</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => router.push("/(recruiter)/reassign")} style={[styles.actionBtn, { backgroundColor: c.navy }]}>
                <Feather name="shuffle" size={16} color={c.white} />
                <Text style={[styles.actionText, { color: c.white, fontFamily: "Inter_600SemiBold" }]}>Reassign</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.actionRow}>
              <TouchableOpacity onPress={() => router.push("/(recruiter)/attendance" as any)} style={[styles.actionBtn, { backgroundColor: c.teal }]}>
                <Feather name="calendar" size={16} color={c.white} />
                <Text style={[styles.actionText, { color: c.white, fontFamily: "Inter_600SemiBold" }]}>Attendance</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => router.push("/(recruiter)/leaves" as any)} style={[styles.actionBtn, { backgroundColor: c.teal }]}>
                <Feather name="file-text" size={16} color={c.white} />
                <Text style={[styles.actionText, { color: c.white, fontFamily: "Inter_600SemiBold" }]}>Leaves</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.actionRow}>
              <TouchableOpacity onPress={() => router.push("/(recruiter)/import" as any)} style={[styles.actionBtn, { backgroundColor: c.navy }]}>
                <Feather name="upload" size={16} color={c.white} />
                <Text style={[styles.actionText, { color: c.white, fontFamily: "Inter_600SemiBold" }]}>Import</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => router.push("/(recruiter)/export" as any)} style={[styles.actionBtn, { backgroundColor: c.navy }]}>
                <Feather name="download" size={16} color={c.white} />
                <Text style={[styles.actionText, { color: c.white, fontFamily: "Inter_600SemiBold" }]}>Export</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.actionRow}>
              <TouchableOpacity onPress={() => router.push("/(recruiter)/qr-settings" as any)} style={[styles.actionBtn, { backgroundColor: c.teal }]}>
                <Feather name="grid" size={16} color={c.white} />
                <Text style={[styles.actionText, { color: c.white, fontFamily: "Inter_600SemiBold" }]}>QR</Text>
              </TouchableOpacity>
              <View style={[styles.actionBtn, { backgroundColor: "transparent" }]} />
            </View>

            <Text style={[styles.listTitle, { color: c.navy, fontFamily: "Poppins_700Bold" }]}>
              My Employees ({data?.employees?.length ?? 0})
            </Text>
          </View>
        }
        ListEmptyComponent={isLoading ? <LoadingScreen /> : <EmptyState icon="users" title="No employees assigned" />}
        contentContainerStyle={{ paddingBottom: bottomPad + 16 }}
        renderItem={({ item }) => {
          const status = getStatus(item);
          const emp = item.employee;
          const shiftDisplay = emp.shift_start_time && emp.shift_end_time 
            ? `${emp.shift_start_time} - ${emp.shift_end_time}` 
            : null;
          
          return (
            <TouchableOpacity 
              style={[styles.card, { backgroundColor: c.white }]}
              onPress={() => router.push(`/(recruiter)/employees/${emp.id}` as any)}
            >
              <View style={styles.cardHeader}>
                <View style={[styles.avatar, { backgroundColor: c.muted }]}>
                  <Text style={[styles.avatarText, { color: c.navy, fontFamily: "Poppins_700Bold" }]}>
                    {emp.full_name.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.empName, { color: c.text, fontFamily: "Inter_600SemiBold" }]}>{emp.full_name}</Text>
                  <Text style={[styles.empSub, { color: c.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                    {emp.designation ?? "—"} · {emp.workplace?.name ?? "—"}
                  </Text>
                  {shiftDisplay && (
                    <Text style={[styles.shiftText, { color: c.teal, fontFamily: "Inter_500Medium" }]}>
                      <Feather name="clock" size={12} color={c.teal} /> Shift: {shiftDisplay}
                    </Text>
                  )}
                </View>
                <StatusBadge status={status} />
              </View>

              {/* Shift Overdue Alert */}
              {item.shift_overdue && !item.logged_in && item.has_shift_today && (
                <View style={[styles.overdueBanner, { backgroundColor: "#FEF3C7" }]}>
                  <Feather name="alert-triangle" size={14} color={c.warning} />
                  <Text style={[styles.overdueText, { color: c.warning, fontFamily: "Inter_600SemiBold" }]}>
                    Shift started {emp.shift_start_time}! Not logged in yet.
                  </Text>
                </View>
              )}

              {(item.login_time || item.signoff_time) && (
                <View style={[styles.timeRow, { borderTopColor: c.border }]}>
                  {item.login_time && (
                    <Text style={[styles.timeText, { color: c.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                      <Feather name="log-in" size={12} color={c.success} /> In: {new Date(item.login_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} {item.login_address ? `· ${item.login_address}` : ""}
                    </Text>
                  )}
                  {item.signoff_time && (
                    <Text style={[styles.timeText, { color: c.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                      <Feather name="log-out" size={12} color={c.destructive} /> Out: {new Date(item.signoff_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </Text>
                  )}
                </View>
              )}

              {status === "absent" && !item.has_absence_note && (
                <View style={styles.absentActions}>
                  {emp.contact_number && (
                    <TouchableOpacity
                      onPress={async () => {
                        // Log the call
                        try {
                          await apiFetch("/call-log", {
                            method: "POST",
                            body: JSON.stringify({ employee_id: emp.id }),
                          });
                        } catch (e) {
                          console.log("Call log error:", e);
                        }
                        // Open phone dialer
                        Linking.openURL(`tel:${emp.contact_number}`);
                      }}
                      style={[styles.absentBtn, { backgroundColor: c.teal }]}
                    >
                      <Feather name="phone" size={14} color={c.white} />
                      <Text style={[styles.absentBtnText, { color: c.white, fontFamily: "Inter_600SemiBold" }]}>Call</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    onPress={() => router.push({ pathname: "/(recruiter)/absence-note", params: { employeeId: emp.id, name: emp.full_name } })}
                    style={[styles.absentBtn, { backgroundColor: c.navy }]}
                  >
                    <Feather name="file-text" size={14} color={c.white} />
                    <Text style={[styles.absentBtnText, { color: c.white, fontFamily: "Inter_600SemiBold" }]}>Log Absence</Text>
                  </TouchableOpacity>
                </View>
              )}

              {item.has_absence_note && (
                <View style={[styles.absenceBanner, { backgroundColor: "#FEF3C7" }]}>
                  <Feather name="check-circle" size={14} color={c.warning} />
                  <Text style={[styles.absenceText, { color: c.warning, fontFamily: "Inter_600SemiBold" }]}>
                    Absence Marked
                  </Text>
                </View>
              )}

              {item.has_call_log && !item.has_absence_note && (
                <View style={[styles.callBanner, { backgroundColor: "#DBEAFE" }]}>
                  <Feather name="phone" size={14} color={c.teal} />
                  <Text style={[styles.callText, { color: c.teal, fontFamily: "Inter_600SemiBold" }]}>
                    Called Employee
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          );
        }}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  listHeader: { padding: 16 },
  statsRow: { flexDirection: "row", gap: 10, marginBottom: 12 },
  statCard: { flex: 1, alignItems: "center", padding: 12, borderRadius: 10, gap: 4, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  statValue: { fontSize: 22 },
  statLabel: { fontSize: 11 },
  actionRow: { flexDirection: "row", gap: 10, marginBottom: 14 },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 8 },
  actionText: { fontSize: 14 },
  listTitle: { fontSize: 16 },
  card: { marginHorizontal: 16, marginBottom: 10, borderRadius: 12, padding: 14, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  avatar: { width: 42, height: 42, borderRadius: 21, justifyContent: "center", alignItems: "center" },
  avatarText: { fontSize: 18 },
  empName: { fontSize: 15 },
  empSub: { fontSize: 12, marginTop: 2 },
  timeRow: { flexDirection: "row", gap: 16, paddingTop: 8, marginTop: 8, borderTopWidth: 1 },
  timeText: { fontSize: 12 },
  absentActions: { flexDirection: "row", gap: 10, marginTop: 10 },
  absentBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 9, borderRadius: 8 },
  absentBtnText: { fontSize: 13 },
  shiftText: { fontSize: 11, marginTop: 2 },
  overdueBanner: { flexDirection: "row", alignItems: "center", gap: 6, padding: 8, borderRadius: 6, marginTop: 8, marginBottom: 4 },
  overdueText: { fontSize: 12, flex: 1 },
  absenceBanner: { flexDirection: "row", alignItems: "center", gap: 6, padding: 8, borderRadius: 6, marginTop: 8 },
  absenceText: { fontSize: 12, flex: 1 },
  callBanner: { flexDirection: "row", alignItems: "center", gap: 6, padding: 8, borderRadius: 6, marginTop: 8 },
  callText: { fontSize: 12, flex: 1 },
});
