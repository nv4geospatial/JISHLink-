import React from "react";
import { View, ActivityIndicator, Text, StyleSheet } from "react-native";
import colors from "@/constants/colors";

export function LoadingScreen({ message }: { message?: string }) {
  const c = colors.light;
  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <ActivityIndicator size="large" color={c.navy} />
      {message && <Text style={[styles.text, { color: c.mutedForeground, fontFamily: "Inter_400Regular" }]}>{message}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center", gap: 16 },
  text: { fontSize: 14 },
});
