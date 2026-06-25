import React, { useState } from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Platform, ActivityIndicator } from "react-native";
import { Feather } from "@expo/vector-icons";
import Toast from "react-native-toast-message";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { NavHeader } from "@/components/NavHeader";
import { EmptyState } from "@/components/EmptyState";
import colors from "@/constants/colors";

interface Notification { id: string; message: string; read: boolean; created_at: string; }

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const c = colors.light;
  const qc = useQueryClient();
  const [clearing, setClearing] = useState(false);

  const { data, refetch } = useQuery<Notification[]>({
    queryKey: ["notifications"],
    queryFn: () => apiFetch("/notifications"),
  });

  const markRead = async (id: string) => {
    await apiFetch(`/notifications/${id}/read`, { method: "POST" });
    qc.invalidateQueries({ queryKey: ["notifications"] });
    qc.invalidateQueries({ queryKey: ["admin-dashboard"] });
  };

  const markAllRead = async () => {
    await apiFetch("/notifications/read-all", { method: "POST" });
    qc.invalidateQueries({ queryKey: ["notifications"] });
    qc.invalidateQueries({ queryKey: ["admin-dashboard"] });
    Toast.show({ type: "success", text1: "All notifications marked as read" });
  };

  const clearAll = async () => {
    if (!confirm("Clear ALL notifications? This cannot be undone.")) return;
    setClearing(true);
    try {
      await apiFetch("/notifications/clear-all", { method: "DELETE" });
      await refetch();
      Toast.show({ type: "success", text1: "All notifications cleared" });
    } catch (e: unknown) {
      Toast.show({ type: "error", text1: e instanceof Error ? e.message : "Failed to clear" });
    } finally {
      setClearing(false);
    }
  };

  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <NavHeader title="Notifications" showBack />
      {/* Action Buttons */}
      {(data ?? []).length > 0 && (
        <View style={styles.actionRow}>
          <TouchableOpacity onPress={markAllRead} style={[styles.actionBtn, { backgroundColor: c.teal }]}>
            <Feather name="check-circle" size={14} color={c.white} />
            <Text style={[styles.actionText, { color: c.white, fontFamily: "Inter_600SemiBold" }]}>Mark All Read</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={clearAll} disabled={clearing} style={[styles.actionBtn, { backgroundColor: c.destructive }]}>
            {clearing ? <ActivityIndicator size="small" color={c.white} /> : (
              <>
                <Feather name="trash-2" size={14} color={c.white} />
                <Text style={[styles.actionText, { color: c.white, fontFamily: "Inter_600SemiBold" }]}>Clear All</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

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
  actionRow: { flexDirection: "row", gap: 10, padding: 16, paddingBottom: 0 },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 8 },
  actionText: { fontSize: 13 },
  item: { flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 14, marginBottom: 8, borderRadius: 10, borderLeftWidth: 3, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  msg: { fontSize: 14 },
  time: { fontSize: 11, marginTop: 4 },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 4 },
});
