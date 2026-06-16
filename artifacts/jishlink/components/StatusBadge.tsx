import React from "react";
import { View, Text, StyleSheet } from "react-native";
import colors from "@/constants/colors";

type Status = "active" | "pending" | "inactive" | "terminated" | "signed_in" | "signed_off" | "absent";

const STATUS_CONFIG: Record<Status, { bg: string; text: string; label: string }> = {
  active: { bg: "#D1FAE5", text: "#065F46", label: "Active" },
  pending: { bg: "#FEF3C7", text: "#92400E", label: "Pending" },
  inactive: { bg: "#F3F4F6", text: "#374151", label: "Inactive" },
  terminated: { bg: "#FEE2E2", text: "#991B1B", label: "Terminated" },
  signed_in: { bg: "#D1FAE5", text: "#065F46", label: "Signed In" },
  signed_off: { bg: "#DBEAFE", text: "#1E40AF", label: "Signed Off" },
  absent: { bg: "#FEE2E2", text: "#991B1B", label: "Not Signed In" },
};

export function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status as Status] ?? { bg: "#F3F4F6", text: "#374151", label: status };
  return (
    <View style={[styles.badge, { backgroundColor: cfg.bg }]}>
      <Text style={[styles.text, { color: cfg.text, fontFamily: "Inter_600SemiBold" }]}>{cfg.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  text: { fontSize: 11 },
});
