import React, { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Toast from "react-native-toast-message";
import { useQuery } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import { apiFetch } from "@/lib/api";
import { NavHeader } from "@/components/NavHeader";
import colors from "@/constants/colors";

interface Workplace { id: string; name: string; }

const SECTIONS = [
  {
    title: "Personal Info",
    fields: [
      { key: "full_name", label: "Full Name *", required: true },
      { key: "dob", label: "Date of Birth (YYYY-MM-DD)" },
      { key: "gender", label: "Gender (Male/Female/Other)" },
      { key: "blood_group", label: "Blood Group" },
      { key: "marital_status", label: "Marital Status" },
      { key: "qualification", label: "Qualification" },
    ],
  },
  {
    title: "Contact",
    fields: [
      { key: "contact_number", label: "Contact Number" },
      { key: "email", label: "Email" },
      { key: "address", label: "Address" },
      { key: "emergency_contact", label: "Emergency Contact" },
      { key: "nominee_name", label: "Nominee Name" },
      { key: "nominee_relation", label: "Nominee Relation" },
    ],
  },
  {
    title: "Employment",
    fields: [
      { key: "designation", label: "Designation" },
      { key: "employment_type", label: "Employment Type" },
      { key: "date_of_joining", label: "Date of Joining (YYYY-MM-DD)" },
      { key: "username", label: "Username *", required: true },
      { key: "password", label: "Password *", required: true, secure: true },
    ],
  },
  {
    title: "Statutory",
    fields: [
      { key: "aadhar_number", label: "Aadhar Number (12 digits)" },
      { key: "pan_number", label: "PAN Number" },
      { key: "pf_number", label: "PF Number" },
      { key: "esi_number", label: "ESI Number" },
      { key: "uan_number", label: "UAN Number" },
    ],
  },
  {
    title: "Bank Details",
    fields: [
      { key: "bank_name", label: "Bank Name" },
      { key: "bank_branch", label: "Branch" },
      { key: "account_number", label: "Account Number" },
      { key: "ifsc_code", label: "IFSC Code" },
    ],
  },
  {
    title: "Transport",
    fields: [
      { key: "driving_license_number", label: "Driving License No." },
      { key: "vehicle_details", label: "Vehicle Details" },
    ],
  },
];

export default function AddEmployeeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const c = colors.light;
  const [form, setForm] = useState<Record<string, string>>({});
  const [workplaceId, setWorkplaceId] = useState("");
  const [role, setRole] = useState("employee");
  const [loading, setLoading] = useState(false);

  const { data: workplaces } = useQuery<Workplace[]>({
    queryKey: ["workplaces"],
    queryFn: () => apiFetch("/workplaces"),
  });

  const set = (key: string, val: string) => setForm((f) => ({ ...f, [key]: val }));

  const handleSave = async () => {
    if (!form["full_name"] || !form["username"] || !form["password"]) {
      Toast.show({ type: "error", text1: "Full name, username, and password are required" });
      return;
    }
    setLoading(true);
    try {
      await apiFetch("/employees", {
        method: "POST",
        body: JSON.stringify({ ...form, workplace_id: workplaceId || undefined, role }),
      });
      Toast.show({ type: "success", text1: "Employee created!" });
      router.back();
    } catch (e: unknown) {
      Toast.show({ type: "error", text1: "Failed", text2: e instanceof Error ? e.message : "Error" });
    } finally {
      setLoading(false);
    }
  };

  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <NavHeader title="Add Employee" showBack />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: bottomPad + 80 }} keyboardShouldPersistTaps="handled">
        {SECTIONS.map((section) => (
          <View key={section.title} style={[styles.section, { backgroundColor: c.white }]}>
            <Text style={[styles.sectionTitle, { color: c.navy, fontFamily: "Poppins_700Bold" }]}>{section.title}</Text>
            {section.fields.map((field) => (
              <View key={field.key} style={styles.fieldGroup}>
                <Text style={[styles.label, { color: c.mutedForeground, fontFamily: "Inter_500Medium" }]}>{field.label}</Text>
                <TextInput
                  style={[styles.input, { borderColor: c.border, backgroundColor: c.offwhite, color: c.text, fontFamily: "Inter_400Regular" }]}
                  value={form[field.key] ?? ""}
                  onChangeText={(v) => set(field.key, v)}
                  placeholder={field.label}
                  placeholderTextColor={c.mutedForeground}
                  secureTextEntry={!!(field as any).secure}
                  autoCapitalize="none"
                />
              </View>
            ))}
          </View>
        ))}

        {/* Workplace picker */}
        <View style={[styles.section, { backgroundColor: c.white }]}>
          <Text style={[styles.sectionTitle, { color: c.navy, fontFamily: "Poppins_700Bold" }]}>Workplace</Text>
          <View style={styles.pillRow}>
            {(workplaces ?? []).map((w) => (
              <TouchableOpacity
                key={w.id}
                onPress={() => setWorkplaceId(w.id)}
                style={[styles.pill, { backgroundColor: workplaceId === w.id ? c.navy : c.muted }]}
              >
                <Text style={[styles.pillText, { color: workplaceId === w.id ? c.white : c.mutedForeground, fontFamily: "Inter_500Medium" }]}>{w.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Role picker */}
        <View style={[styles.section, { backgroundColor: c.white }]}>
          <Text style={[styles.sectionTitle, { color: c.navy, fontFamily: "Poppins_700Bold" }]}>Role</Text>
          <View style={styles.pillRow}>
            {["employee", "recruiter", "admin"].map((r) => (
              <TouchableOpacity
                key={r}
                onPress={() => setRole(r)}
                style={[styles.pill, { backgroundColor: role === r ? c.navy : c.muted }]}
              >
                <Text style={[styles.pillText, { color: role === r ? c.white : c.mutedForeground, fontFamily: "Inter_500Medium" }]}>{r}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </ScrollView>

      <View style={[styles.bottomBar, { backgroundColor: c.white, paddingBottom: bottomPad + 8 }]}>
        <TouchableOpacity onPress={router.back} style={[styles.cancelBtn, { borderColor: c.border }]}>
          <Text style={[styles.cancelText, { color: c.mutedForeground, fontFamily: "Inter_500Medium" }]}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleSave} style={[styles.saveBtn, { backgroundColor: c.gold }]} disabled={loading}>
          {loading ? <ActivityIndicator color={c.navy} /> : <Text style={[styles.saveBtnText, { color: c.navy, fontFamily: "Poppins_700Bold" }]}>Save Employee</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  section: { borderRadius: 10, padding: 16, marginBottom: 12, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  sectionTitle: { fontSize: 15, marginBottom: 12 },
  fieldGroup: { marginBottom: 12 },
  label: { fontSize: 12, marginBottom: 4 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pill: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20 },
  pillText: { fontSize: 13 },
  bottomBar: { flexDirection: "row", gap: 12, paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: "#E5E7EB" },
  cancelBtn: { flex: 1, borderWidth: 1, borderRadius: 8, alignItems: "center", paddingVertical: 13 },
  cancelText: { fontSize: 15 },
  saveBtn: { flex: 2, borderRadius: 8, alignItems: "center", paddingVertical: 13 },
  saveBtnText: { fontSize: 15 },
});
