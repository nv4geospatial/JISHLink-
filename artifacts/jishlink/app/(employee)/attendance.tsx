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

interface AttendanceLog {
  id: string; type: string; timestamp: string; resolved_address?: string | null;
}

export default function AttendanceHistoryScreen() {
  const insets = useSafeAreaInsets();
  const c = colors.light;

  const { data, isLoading } = useQuery<AttendanceLog[]>({
    queryKey: ["my-attendance"],
    queryFn: () => apiFetch("/attendance/my?days=30"),
  });

  const grouped: Record<string, AttendanceLog[]> = {};
  (data ?? []).forEach((log) => {
    const day = new Date(log.timestamp).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
    if (!grouped[day]) grouped[day] = [];
    grouped[day]!.push(log);
  });

  const days = Object.entries(grouped);
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <NavHeader title="Attendance History" showBack />
      {isLoading ? <LoadingScreen /> : (
        <FlatList
          data={days}
          keyExtractor={([day]) => day}
          contentContainerStyle={{ padding: 16, paddingBottom: bottomPad + 16 }}
          ListEmptyComponent={<EmptyState icon="calendar" title="No attendance records" subtitle="Start logging your attendance" />}
          renderItem={({ item: [day, logs] }) => (
            <View style={[styles.dayGroup, { backgroundColor: c.white }]}>
              <Text style={[styles.dayLabel, { color: c.navy, fontFamily: "Poppins_700Bold" }]}>{day}</Text>
              {logs.map((log) => (
                <View key={log.id} style={styles.logRow}>
                  <View style={[styles.logIcon, { backgroundColor: log.type === "login" ? "#D1FAE5" : "#DBEAFE" }]}>
                    <Feather name={log.type === "login" ? "log-in" : "log-out"} size={14} color={log.type === "login" ? "#065F46" : "#1E40AF"} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.logType, { color: c.text, fontFamily: "Inter_600SemiBold" }]}>
                      {log.type === "login" ? "Logged In" : "Signed Off"}
                    </Text>
                    <Text style={[styles.logTime, { color: c.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                      {new Date(log.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </Text>
                    {log.resolved_address && (
                      <Text style={[styles.logAddr, { color: c.mutedForeground, fontFamily: "Inter_400Regular" }]} numberOfLines={2}>
                        📍 {log.resolved_address}
                      </Text>
                    )}
                  </View>
                </View>
              ))}
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  dayGroup: { borderRadius: 10, padding: 14, marginBottom: 10, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  dayLabel: { fontSize: 13, marginBottom: 10 },
  logRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 8 },
  logIcon: { width: 30, height: 30, borderRadius: 15, justifyContent: "center", alignItems: "center" },
  logType: { fontSize: 14 },
  logTime: { fontSize: 12, marginTop: 1 },
  logAddr: { fontSize: 11, marginTop: 2 },
});
