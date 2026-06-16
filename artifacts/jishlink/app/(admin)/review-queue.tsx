import React, { useState } from "react";
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput,
  Modal, ActivityIndicator, ScrollView, Platform,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Toast from "react-native-toast-message";
import { apiFetch } from "@/lib/api";
import { NavHeader } from "@/components/NavHeader";
import { EmptyState } from "@/components/EmptyState";
import { LoadingScreen } from "@/components/LoadingScreen";
import colors from "@/constants/colors";

interface Submission {
  id: string; source: string; status: string; submitted_at: string;
  submitted_data: Record<string, unknown>;
  validation_results?: Array<{ field: string; valid: boolean; message?: string }>;
  admin_remarks?: string | null;
}

interface Workplace { id: string; name: string; }
interface Employee { id: string; full_name: string; role?: string | null; }

export default function ReviewQueueScreen() {
  const insets = useSafeAreaInsets();
  const c = colors.light;
  const qc = useQueryClient();
  const [approveModal, setApproveModal] = useState<Submission | null>(null);
  const [rejectModal, setRejectModal] = useState<Submission | null>(null);
  const [remarks, setRemarks] = useState("");
  const [approveForm, setApproveForm] = useState({ workplace_id: "", reporting_manager_id: "", username: "", password: "", designation: "" });
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data: submissions, isLoading } = useQuery<Submission[]>({
    queryKey: ["submissions"],
    queryFn: () => apiFetch("/submissions?status=submitted"),
  });

  const { data: workplaces } = useQuery<Workplace[]>({
    queryKey: ["workplaces"],
    queryFn: () => apiFetch("/workplaces"),
  });

  const { data: recruiters } = useQuery<Employee[]>({
    queryKey: ["recruiters"],
    queryFn: async () => {
      const all = await apiFetch<Employee[]>("/employees");
      return all.filter((e) => e.role === "recruiter");
    },
  });

  const handleApprove = async () => {
    if (!approveModal) return;
    if (!approveForm.workplace_id || !approveForm.reporting_manager_id || !approveForm.username || !approveForm.password) {
      Toast.show({ type: "error", text1: "Fill all required fields" }); return;
    }
    setLoading(true);
    try {
      await apiFetch(`/submissions/${approveModal.id}/approve`, { method: "POST", body: JSON.stringify(approveForm) });
      Toast.show({ type: "success", text1: "Approved! Employee created." });
      qc.invalidateQueries({ queryKey: ["submissions"] });
      setApproveModal(null);
    } catch (e: unknown) {
      Toast.show({ type: "error", text1: e instanceof Error ? e.message : "Failed" });
    } finally { setLoading(false); }
  };

  const handleReject = async () => {
    if (!rejectModal || !remarks.trim()) { Toast.show({ type: "error", text1: "Enter remarks" }); return; }
    setLoading(true);
    try {
      await apiFetch(`/submissions/${rejectModal.id}/reject`, { method: "POST", body: JSON.stringify({ remarks }) });
      Toast.show({ type: "success", text1: "Submission sent back" });
      qc.invalidateQueries({ queryKey: ["submissions"] });
      setRejectModal(null);
      setRemarks("");
    } catch (e: unknown) {
      Toast.show({ type: "error", text1: e instanceof Error ? e.message : "Failed" });
    } finally { setLoading(false); }
  };

  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <NavHeader title="Review Queue" showBack />
      {isLoading ? <LoadingScreen /> : (
        <FlatList
          data={submissions ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, paddingBottom: bottomPad + 16 }}
          ListEmptyComponent={<EmptyState icon="inbox" title="No pending submissions" subtitle="All clear!" />}
          renderItem={({ item }) => {
            const d = item.submitted_data;
            const validations = item.validation_results ?? [];
            const allValid = validations.every((v) => v.valid);
            const isExpanded = expanded === item.id;

            return (
              <View style={[styles.card, { backgroundColor: c.white }]}>
                <TouchableOpacity onPress={() => setExpanded(isExpanded ? null : item.id)}>
                  <View style={styles.cardHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.name, { color: c.navy, fontFamily: "Inter_600SemiBold" }]}>
                        {String(d["full_name"] ?? d["Full Name"] ?? "Unknown")}
                      </Text>
                      <Text style={[styles.sub, { color: c.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                        {String(d["contact_number"] ?? d["Contact Number"] ?? "")} · {new Date(item.submitted_at).toLocaleDateString()}
                      </Text>
                    </View>
                    <View style={{ alignItems: "flex-end", gap: 4 }}>
                      <View style={[styles.badge, { backgroundColor: allValid ? "#D1FAE5" : "#FEE2E2" }]}>
                        <Feather name={allValid ? "check-circle" : "alert-circle"} size={12} color={allValid ? "#065F46" : "#991B1B"} />
                        <Text style={[styles.badgeText, { color: allValid ? "#065F46" : "#991B1B", fontFamily: "Inter_600SemiBold" }]}>
                          {allValid ? "Valid" : "Issues"}
                        </Text>
                      </View>
                      <Feather name={isExpanded ? "chevron-up" : "chevron-down"} size={16} color={c.mutedForeground} />
                    </View>
                  </View>
                </TouchableOpacity>

                {isExpanded && (
                  <View style={styles.expanded}>
                    {validations.map((v) => (
                      <View key={v.field} style={styles.validRow}>
                        <Feather name={v.valid ? "check" : "x"} size={14} color={v.valid ? "#16A34A" : "#DC2626"} />
                        <Text style={[styles.validText, { color: v.valid ? "#16A34A" : "#DC2626", fontFamily: "Inter_400Regular" }]}>
                          {v.field}: {v.message ?? "OK"}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}

                <View style={styles.actions}>
                  <TouchableOpacity
                    onPress={() => { setApproveModal(item); setApproveForm({ workplace_id: "", reporting_manager_id: "", username: "", password: String(d["full_name"] ?? "").toLowerCase().replace(/\s/g, "."), designation: String(d["designation"] ?? "") }); }}
                    style={[styles.approveBtn, { backgroundColor: c.navy }]}
                  >
                    <Feather name="check" size={14} color={c.white} />
                    <Text style={[styles.actionText, { color: c.white, fontFamily: "Inter_600SemiBold" }]}>Approve</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setRejectModal(item)}
                    style={[styles.rejectBtn, { borderColor: c.destructive }]}
                  >
                    <Feather name="x" size={14} color={c.destructive} />
                    <Text style={[styles.actionText, { color: c.destructive, fontFamily: "Inter_600SemiBold" }]}>Send Back</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          }}
        />
      )}

      {/* Approve Modal */}
      <Modal visible={!!approveModal} transparent animationType="slide">
        <View style={styles.overlay}>
          <View style={[styles.modal, { backgroundColor: c.white }]}>
            <Text style={[styles.modalTitle, { color: c.navy, fontFamily: "Poppins_700Bold" }]}>Approve Submission</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {[
                { label: "Username *", key: "username" },
                { label: "Password *", key: "password", secure: true },
                { label: "Designation", key: "designation" },
              ].map((f) => (
                <View key={f.key} style={{ marginBottom: 12 }}>
                  <Text style={[styles.label, { color: c.mutedForeground, fontFamily: "Inter_500Medium" }]}>{f.label}</Text>
                  <TextInput
                    style={[styles.input, { borderColor: c.border, backgroundColor: c.offwhite, color: c.text, fontFamily: "Inter_400Regular" }]}
                    value={approveForm[f.key as keyof typeof approveForm]}
                    onChangeText={(v) => setApproveForm((p) => ({ ...p, [f.key]: v }))}
                    secureTextEntry={!!(f as any).secure}
                    autoCapitalize="none"
                    placeholder={f.label}
                    placeholderTextColor={c.mutedForeground}
                  />
                </View>
              ))}

              <Text style={[styles.label, { color: c.mutedForeground, fontFamily: "Inter_500Medium" }]}>Workplace *</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                <View style={{ flexDirection: "row", gap: 8, paddingBottom: 4 }}>
                  {(workplaces ?? []).map((w) => (
                    <TouchableOpacity
                      key={w.id}
                      onPress={() => setApproveForm((p) => ({ ...p, workplace_id: w.id }))}
                      style={[styles.pill, { backgroundColor: approveForm.workplace_id === w.id ? c.navy : c.muted }]}
                    >
                      <Text style={[styles.pillText, { color: approveForm.workplace_id === w.id ? c.white : c.mutedForeground }]}>{w.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>

              <Text style={[styles.label, { color: c.mutedForeground, fontFamily: "Inter_500Medium" }]}>Reporting Manager *</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                <View style={{ flexDirection: "row", gap: 8, paddingBottom: 4 }}>
                  {(recruiters ?? []).map((r) => (
                    <TouchableOpacity
                      key={r.id}
                      onPress={() => setApproveForm((p) => ({ ...p, reporting_manager_id: r.id }))}
                      style={[styles.pill, { backgroundColor: approveForm.reporting_manager_id === r.id ? c.navy : c.muted }]}
                    >
                      <Text style={[styles.pillText, { color: approveForm.reporting_manager_id === r.id ? c.white : c.mutedForeground }]}>{r.full_name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </ScrollView>

            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity onPress={() => setApproveModal(null)} style={[styles.cancelBtn, { borderColor: c.border }]}>
                <Text style={[styles.cancelText, { color: c.mutedForeground, fontFamily: "Inter_500Medium" }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleApprove} style={[styles.saveBtn, { backgroundColor: c.gold }]} disabled={loading}>
                {loading ? <ActivityIndicator color={c.navy} /> : <Text style={[styles.saveBtnText, { color: c.navy, fontFamily: "Poppins_700Bold" }]}>Approve</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Reject Modal */}
      <Modal visible={!!rejectModal} transparent animationType="slide">
        <View style={styles.overlay}>
          <View style={[styles.modal, { backgroundColor: c.white }]}>
            <Text style={[styles.modalTitle, { color: c.navy, fontFamily: "Poppins_700Bold" }]}>Send Back Submission</Text>
            <Text style={[styles.label, { color: c.mutedForeground, fontFamily: "Inter_500Medium", marginBottom: 8 }]}>Remarks for applicant *</Text>
            <TextInput
              style={[styles.textarea, { borderColor: c.border, backgroundColor: c.offwhite, color: c.text, fontFamily: "Inter_400Regular" }]}
              value={remarks}
              onChangeText={setRemarks}
              placeholder="Explain what needs to be corrected..."
              placeholderTextColor={c.mutedForeground}
              multiline
              numberOfLines={4}
            />
            <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
              <TouchableOpacity onPress={() => { setRejectModal(null); setRemarks(""); }} style={[styles.cancelBtn, { borderColor: c.border }]}>
                <Text style={[styles.cancelText, { color: c.mutedForeground, fontFamily: "Inter_500Medium" }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleReject} style={[styles.saveBtn, { backgroundColor: c.destructive }]} disabled={loading}>
                {loading ? <ActivityIndicator color={c.white} /> : <Text style={[styles.saveBtnText, { color: c.white, fontFamily: "Poppins_700Bold" }]}>Send Back</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  card: { borderRadius: 10, padding: 14, marginBottom: 10, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  cardHeader: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  name: { fontSize: 15 },
  sub: { fontSize: 12, marginTop: 2 },
  badge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  badgeText: { fontSize: 11 },
  expanded: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: "#F3F4F6" },
  validRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 },
  validText: { fontSize: 12 },
  actions: { flexDirection: "row", gap: 10, marginTop: 12 },
  approveBtn: { flex: 1, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 6, paddingVertical: 10, borderRadius: 8 },
  rejectBtn: { flex: 1, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 6, paddingVertical: 10, borderRadius: 8, borderWidth: 1 },
  actionText: { fontSize: 13 },
  overlay: { flex: 1, backgroundColor: "#00000066", justifyContent: "flex-end" },
  modal: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, maxHeight: "90%" },
  modalTitle: { fontSize: 18, marginBottom: 16 },
  label: { fontSize: 13, marginBottom: 4 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  textarea: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, minHeight: 100, textAlignVertical: "top" },
  pill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  pillText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  cancelBtn: { flex: 1, borderWidth: 1, borderRadius: 8, alignItems: "center", paddingVertical: 13 },
  cancelText: { fontSize: 15 },
  saveBtn: { flex: 1, borderRadius: 8, alignItems: "center", paddingVertical: 13 },
  saveBtnText: { fontSize: 15 },
});
