import React, { useState } from "react";
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView,
  ActivityIndicator, Platform,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import Toast from "react-native-toast-message";
import { apiFetch } from "@/lib/api";
import { NavHeader } from "@/components/NavHeader";
import colors from "@/constants/colors";

const REASONS = ["Absent", "Late", "Left Early", "No Show", "Other"];

export default function AbsenceNoteScreen() {
  const { employeeId, name } = useLocalSearchParams<{ employeeId: string; name: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const c = colors.light;
  const qc = useQueryClient();
  const [reason, setReason] = useState(REASONS[0]!);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  const today = new Date().toISOString().split("T")[0]!;

  const handleSubmit = async () => {
    if (!employeeId) { Toast.show({ type: "error", text1: "Employee not specified" }); return; }
    setLoading(true);
    try {
      await apiFetch("/absence-notes", {
        method: "POST",
        body: JSON.stringify({ employee_id: employeeId, date: today, reason, notes: notes || undefined }),
      });
      Toast.show({ type: "success", text1: "Absence note saved" });
      await qc.invalidateQueries({ queryKey: ["recruiter-dashboard"] });
      await qc.refetchQueries({ queryKey: ["recruiter-dashboard"] });
      router.back();
    } catch (e: unknown) {
      Toast.show({ type: "error", text1: e instanceof Error ? e.message : "Failed" });
    } finally {
      setLoading(false);
    }
  };

  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <NavHeader title="Log Absence" showBack />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: bottomPad + 80 }} keyboardShouldPersistTaps="handled">
        <View style={[styles.card, { backgroundColor: c.white }]}>
          <View style={styles.empRow}>
            <View style={[styles.avatar, { backgroundColor: c.muted }]}>
              <Text style={[styles.avatarText, { color: c.navy, fontFamily: "Poppins_700Bold" }]}>
                {(name ?? "?").charAt(0).toUpperCase()}
              </Text>
            </View>
            <View>
              <Text style={[styles.empName, { color: c.navy, fontFamily: "Inter_600SemiBold" }]}>{name}</Text>
              <Text style={[styles.empDate, { color: c.mutedForeground, fontFamily: "Inter_400Regular" }]}>{today}</Text>
            </View>
          </View>

          <Text style={[styles.label, { color: c.mutedForeground, fontFamily: "Inter_500Medium" }]}>Reason</Text>
          <View style={styles.reasonRow}>
            {REASONS.map((r) => (
              <TouchableOpacity
                key={r}
                onPress={() => setReason(r)}
                style={[styles.reasonPill, { backgroundColor: reason === r ? c.navy : c.muted }]}
              >
                <Text style={[styles.reasonText, { color: reason === r ? c.white : c.mutedForeground, fontFamily: "Inter_500Medium" }]}>{r}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[styles.label, { color: c.mutedForeground, fontFamily: "Inter_500Medium", marginTop: 16 }]}>Notes (optional)</Text>
          <TextInput
            style={[styles.textarea, { borderColor: c.border, backgroundColor: c.offwhite, color: c.text, fontFamily: "Inter_400Regular" }]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Additional details..."
            placeholderTextColor={c.mutedForeground}
            multiline
            numberOfLines={4}
          />
        </View>
      </ScrollView>

      <View style={[styles.bottomBar, { backgroundColor: c.white, paddingBottom: bottomPad + 8 }]}>
        <TouchableOpacity onPress={router.back} style={[styles.cancelBtn, { borderColor: c.border }]}>
          <Text style={[styles.cancelText, { color: c.mutedForeground, fontFamily: "Inter_500Medium" }]}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleSubmit} style={[styles.saveBtn, { backgroundColor: c.gold }]} disabled={loading}>
          {loading ? <ActivityIndicator color={c.navy} /> : (
            <Text style={[styles.saveBtnText, { color: c.navy, fontFamily: "Poppins_700Bold" }]}>Submit Note</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  card: { borderRadius: 12, padding: 16, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  empRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 20 },
  avatar: { width: 44, height: 44, borderRadius: 22, justifyContent: "center", alignItems: "center" },
  avatarText: { fontSize: 20 },
  empName: { fontSize: 16 },
  empDate: { fontSize: 12, marginTop: 2 },
  label: { fontSize: 13, marginBottom: 8 },
  reasonRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  reasonPill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  reasonText: { fontSize: 13 },
  textarea: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, minHeight: 100, textAlignVertical: "top" },
  bottomBar: { flexDirection: "row", gap: 12, paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: "#E5E7EB" },
  cancelBtn: { flex: 1, borderWidth: 1, borderRadius: 8, alignItems: "center", paddingVertical: 13 },
  cancelText: { fontSize: 15 },
  saveBtn: { flex: 2, borderRadius: 8, alignItems: "center", paddingVertical: 13 },
  saveBtnText: { fontSize: 15 },
});
