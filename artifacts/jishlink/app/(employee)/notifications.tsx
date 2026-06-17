import React from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Platform } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { apiFetch } from "@/lib/api";
import { NavHeader } from "@/components/NavHeader";
import { EmptyState } from "@/components/EmptyState";
import colors from "@/constants/colors";

interface Notification { id: string; message: string; read: boolean; created_at: string; }

export default function EmployeeNotifications() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const c = colors.light;
  const qc = useQueryClient();

  const { data } = useQuery<Notification[]>({
    queryKey: ["notifications"],
    queryFn: () => apiFetch("/notifications"),
  });

  const markRead = async (id: string) => {
    await apiFetch(`/notifications/${id}/read`, { method: "POST" });
    qc.invalidateQueries({ queryKey: ["notifications"] });
    qc.invalidateQueries({ queryKey: ["employee-dashboard"] });
  };

  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <NavHeader 
        title="Notifications" 
        showBack 
        onBack={() => router.replace("/(employee)/dashboard")}
      />
      <FlatList
        data={data ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, paddingBottom: bottomPad + 16 }}
        ListEmptyComponent={<EmptyState icon="bell" title="No notifications" subtitle="You're all caught up" />}
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() => !item.read && markRead(item.id)}
            style={[styles.item, { backgroundColor: item.read ? c.white : "#EFF6FF", borderLeftColor: item.read ? c.border : c.teal }]}
          >
            <Feather name={item.read ? "bell" : "bell"} size={18} color={item.read ? c.mutedForeground : c.teal} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.msg, { color: c.text, fontFamily: item.read ? "Inter_400Regular" : "Inter_600SemiBold" }]}>{item.message}</Text>
              <Text style={[styles.time, { color: c.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                {new Date(item.created_at).toLocaleString()}
              </Text>
            </View>
            {!item.read && <View style={[styles.dot, { backgroundColor: c.teal }]} />}
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  item: { flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 14, marginBottom: 8, borderRadius: 10, borderLeftWidth: 3, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  msg: { fontSize: 14 },
  time: { fontSize: 11, marginTop: 4 },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 4 },
});
