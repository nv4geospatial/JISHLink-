import React from "react";
import { View, Text, FlatList, StyleSheet, Platform } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { NavHeader } from "@/components/NavHeader";
import { EmptyState } from "@/components/EmptyState";
import { LoadingScreen } from "@/components/LoadingScreen";
import colors from "@/constants/colors";

interface RecruiterStats {
  recruiter: { id: string; full_name: string; designation?: string | null };
  total_employees: number;
  signed_in_today: number;
  not_signed_in_today: number;
  absence_notes_this_month: number;
  reassignments_this_month: number;
}

export default function RecruiterOversightScreen() {
  const insets = useSafeAreaInsets();
  const c = colors.light;

  const { data, isLoading } = useQuery<RecruiterStats[]>({
    queryKey: ["recruiter-oversight"],
    queryFn: () => apiFetch("/recruiter-oversight"),
  });

  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <NavHeader title="Recruiter Oversight" showBack />
      {isLoading ? <LoadingScreen /> : (
        <FlatList
          data={data ?? []}
          keyExtractor={(item) => item.recruiter.id}
          contentContainerStyle={{ padding: 16, paddingBottom: bottomPad + 16 }}
          ListEmptyComponent={<EmptyState icon="users" title="No recruiters found" />}
          renderItem={({ item }) => (
            <View style={[styles.card, { backgroundColor: c.white }]}>
              <View style={styles.header}>
                <View style={[styles.avatar, { backgroundColor: c.teal }]}>
                  <Text style={[styles.avatarText, { color: c.white, fontFamily: "Poppins_700Bold" }]}>
                    {item.recruiter.full_name.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.name, { color: c.navy, fontFamily: "Inter_600SemiBold" }]}>{item.recruiter.full_name}</Text>
                  <Text style={[styles.sub, { color: c.mutedForeground, fontFamily: "Inter_400Regular" }]}>{item.recruiter.designation ?? "Recruiter"}</Text>
                </View>
                <View style={[styles.teamBadge, { backgroundColor: c.navy }]}>
                  <Text style={[styles.teamText, { color: c.gold, fontFamily: "Poppins_700Bold" }]}>{item.total_employees}</Text>
                  <Text style={[styles.teamLabel, { color: "#FFFFFF99", fontFamily: "Inter_400Regular" }]}>team</Text>
                </View>
              </View>

              <View style={styles.statsRow}>
                {[
                  { icon: "log-in", label: "Signed In", value: item.signed_in_today, color: c.success },
                  { icon: "x-circle", label: "Absent", value: item.not_signed_in_today, color: c.destructive },
                  { icon: "file-text", label: "Absences", value: item.absence_notes_this_month, color: c.warning },
                  { icon: "shuffle", label: "Reassigned", value: item.reassignments_this_month, color: c.teal },
                ].map((stat) => (
                  <View key={stat.label} style={[styles.stat, { backgroundColor: c.background }]}>
                    <Feather name={stat.icon as any} size={16} color={stat.color} />
                    <Text style={[styles.statValue, { color: stat.color, fontFamily: "Poppins_700Bold" }]}>{stat.value}</Text>
                    <Text style={[styles.statLabel, { color: c.mutedForeground, fontFamily: "Inter_400Regular" }]}>{stat.label}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  card: { borderRadius: 12, padding: 16, marginBottom: 12, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 },
  avatar: { width: 44, height: 44, borderRadius: 22, justifyContent: "center", alignItems: "center" },
  avatarText: { fontSize: 20 },
  name: { fontSize: 15 },
  sub: { fontSize: 12, marginTop: 2 },
  teamBadge: { alignItems: "center", padding: 8, borderRadius: 8 },
  teamText: { fontSize: 20 },
  teamLabel: { fontSize: 10 },
  statsRow: { flexDirection: "row", gap: 8 },
  stat: { flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: 8, gap: 2 },
  statValue: { fontSize: 18 },
  statLabel: { fontSize: 10 },
});
