import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import colors from "@/constants/colors";

interface EmptyStateProps {
  icon?: keyof typeof Feather.glyphMap;
  title: string;
  subtitle?: string;
}

export function EmptyState({ icon = "inbox", title, subtitle }: EmptyStateProps) {
  const c = colors.light;
  return (
    <View style={styles.container}>
      <Feather name={icon} size={48} color={c.muted} />
      <Text style={[styles.title, { color: c.mutedForeground, fontFamily: "Inter_600SemiBold" }]}>{title}</Text>
      {subtitle && <Text style={[styles.sub, { color: c.mutedForeground, fontFamily: "Inter_400Regular" }]}>{subtitle}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12, padding: 40 },
  title: { fontSize: 16, textAlign: "center" },
  sub: { fontSize: 14, textAlign: "center" },
});
