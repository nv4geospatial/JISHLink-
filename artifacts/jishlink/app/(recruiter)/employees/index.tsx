import React, { useState, useCallback } from "react";
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, Platform, RefreshControl, Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Toast from "react-native-toast-message";
import { apiFetch } from "@/lib/api";
import { NavHeader } from "@/components/NavHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyState } from "@/components/EmptyState";
import { LoadingScreen } from "@/components/LoadingScreen";
import colors from "@/constants/colors";

interface Employee {
  id: string; full_name: string; designation?: string | null;
  employment_status?: string | null; workplace?: { name: string } | null;
  employee_code: string; contact_number?: string | null;
  shift_start_time?: string | null; shift_end_time?: string | null;
}

const FILTERS = ["All", "active", "inactive"];

export default function RecruiterEmployeesList() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const c = colors.light;
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");
  const [refreshing, setRefreshing] = useState(false);

  const { data: employees, isLoading, refetch } = useQuery<Employee[]>({
    queryKey: ["recruiter-employees", search, filter],
    queryFn: () => apiFetch(`/employees?${new URLSearchParams({
      ...(search ? { search } : {}),
      ...(filter !== "All" ? { status: filter } : {}),
    }).toString()}`),
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, []);

  const handleDelete = (id: string, name: string) => {
    Alert.alert(
      "Deactivate Employee",
      `Are you sure you want to deactivate ${name}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Deactivate",
          style: "destructive",
          onPress: async () => {
            try {
              await apiFetch(`/employees/${id}`, { method: "DELETE" });
              Toast.show({ type: "success", text1: "Employee deactivated" });
              qc.invalidateQueries({ queryKey: ["recruiter-employees"] });
              qc.invalidateQueries({ queryKey: ["recruiter-dashboard"] });
            } catch (e: unknown) {
              Toast.show({ type: "error", text1: "Failed", text2: e instanceof Error ? e.message : "Error" });
            }
          },
        },
      ]
    );
  };

  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <NavHeader title="My Employees" showBack />

      <FlatList
        data={employees ?? []}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.navy} />}
        ListHeaderComponent={
          <View style={styles.listHeader}>
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
              <TouchableOpacity 
                onPress={() => router.push("/(recruiter)/employees/add" as any)} 
                style={[styles.filterChip, { backgroundColor: c.gold, marginLeft: "auto" }]}
              >
                <Feather name="plus" size={14} color={c.navy} />
                <Text style={[styles.filterText, { color: c.navy, fontFamily: "Inter_600SemiBold" }]}>Add</Text>
              </TouchableOpacity>
            </View>

            <Text style={[styles.sectionTitle, { color: c.navy, fontFamily: "Poppins_700Bold" }]}>
              Employees ({employees?.length ?? 0})
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={[styles.empRow, { backgroundColor: c.white }]}>
            <TouchableOpacity
              style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 12 }}
              onPress={() => router.push(`/(recruiter)/employees/${item.id}` as any)}
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
                {item.shift_start_time && item.shift_end_time && (
                  <Text style={[styles.shiftText, { color: c.teal, fontFamily: "Inter_500Medium" }]}>
                    <Feather name="clock" size={12} color={c.teal} /> {item.shift_start_time} - {item.shift_end_time}
                  </Text>
                )}
              </View>
              <StatusBadge status={item.employment_status ?? "pending"} />
            </TouchableOpacity>

            <View style={styles.actionsRow}>
              <TouchableOpacity
                onPress={() => router.push({ pathname: "/(recruiter)/employees/edit", params: { id: item.id } } as any)}
                style={[styles.actionIconBtn, { backgroundColor: c.teal }]}
              >
                <Feather name="edit-2" size={14} color={c.white} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleDelete(item.id, item.full_name)}
                style={[styles.actionIconBtn, { backgroundColor: c.destructive }]}
              >
                <Feather name="trash-2" size={14} color={c.white} />
              </TouchableOpacity>
            </View>
          </View>
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
  searchWrap: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12 },
  searchInput: { flex: 1, fontSize: 14 },
  filterRow: { flexDirection: "row", gap: 8, marginBottom: 16, flexWrap: "wrap" },
  filterChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, justifyContent: "center", alignItems: "center", flexDirection: "row", gap: 4 },
  filterText: { fontSize: 13 },
  sectionTitle: { fontSize: 16, marginBottom: 8 },
  empRow: { flexDirection: "row", alignItems: "center", gap: 8, padding: 14, marginHorizontal: 16, marginBottom: 8, borderRadius: 10, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  avatar: { width: 42, height: 42, borderRadius: 21, justifyContent: "center", alignItems: "center" },
  avatarText: { fontSize: 18 },
  empName: { fontSize: 15 },
  empSub: { fontSize: 12, marginTop: 2 },
  shiftText: { fontSize: 11, marginTop: 2 },
  actionsRow: { flexDirection: "row", gap: 6 },
  actionIconBtn: { width: 32, height: 32, borderRadius: 16, justifyContent: "center", alignItems: "center" },
});