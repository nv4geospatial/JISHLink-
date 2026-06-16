import React, { useCallback, useState } from "react";
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  RefreshControl, Platform, Linking,
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

interface EmployeeStatus {
  employee: { id: string; full_name: string; designation?: string | null; contact_number?: string | null; workplace?: { name: string } | null };
  logged_in: boolean; signed_off: boolean;
  login_time?: string | null; signoff_time?: string | null; login_address?: string | null;
}

interface RecruiterDashboard {
  team_count: number; signed_in_today: number; not_signed_in: number;
  employees: EmployeeStatus[];
}

interface Notification { id: string; read: boolean; }

export default function RecruiterDashboard() {
  const { logout } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const c = colors.light;
  const [refreshing, setRefreshing] = useState(false);

  const { data, isLoading, refetch } = useQuery<RecruiterDashboard>({
    queryKey: ["recruiter-dashboard"],
    queryFn: () => apiFetch("/dashboard/recruiter"),
  });

  const { data: notifications } = useQuery<Notification[]>({
    queryKey: ["notifications"],
    queryFn: () => apiFetch("/notifications"),
  });

  const unread = (notifications ?? []).filter((n) => !n.read).length;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, []);

  const getStatus = (emp: EmployeeStatus): string => {
    if (emp.signed_off) return "signed_off";
    if (emp.logged_in) return "signed_in";
    return "absent";
  };

  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <NavHeader
        title="My Team"
        rightIcon={<Feather name="bell" size={22} color={c.white} />}
        notificationCount={unread}
        onRightPress={() => router.push("/(recruiter)/notifications")}
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
              <TouchableOpacity onPress={() => router.push("/(recruiter)/reassign")} style={[styles.actionBtn, { backgroundColor: c.teal }]}>
                <Feather name="shuffle" size={16} color={c.white} />
                <Text style={[styles.actionText, { color: c.white, fontFamily: "Inter_600SemiBold" }]}>Reassign</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={logout} style={[styles.actionBtn, { backgroundColor: c.muted }]}>
                <Feather name="log-out" size={16} color={c.destructive} />
                <Text style={[styles.actionText, { color: c.destructive, fontFamily: "Inter_600SemiBold" }]}>Logout</Text>
              </TouchableOpacity>
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
          return (
            <View style={[styles.card, { backgroundColor: c.white }]}>
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
                </View>
                <StatusBadge status={status} />
              </View>

              {(item.login_time || item.signoff_time) && (
                <View style={[styles.timeRow, { borderTopColor: c.border }]}>
                  {item.login_time && (
                    <Text style={[styles.timeText, { color: c.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                      In: {new Date(item.login_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </Text>
                  )}
                  {item.signoff_time && (
                    <Text style={[styles.timeText, { color: c.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                      Out: {new Date(item.signoff_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </Text>
                  )}
                </View>
              )}

              {status === "absent" && (
                <View style={styles.absentActions}>
                  {emp.contact_number && (
                    <TouchableOpacity
                      onPress={() => Linking.openURL(`tel:${emp.contact_number}`)}
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
            </View>
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
});
