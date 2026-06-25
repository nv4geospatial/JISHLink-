import React, { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Toast from "react-native-toast-message";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { NavHeader } from "@/components/NavHeader";
import colors from "@/constants/colors";

interface Workplace { id: string; name: string; }

const GENDER_OPTIONS = ["Male", "Female", "Other"];
const BLOOD_GROUP_OPTIONS = ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"];
const MARITAL_STATUS_OPTIONS = ["Single", "Married", "Divorced", "Widowed"];

interface FieldConfig {
  key: string;
  label: string;
  required?: boolean;
  secure?: boolean;
  type?: "text" | "gender" | "blood_group" | "marital_status" | "date" | "aadhar" | "pan" | "email" | "phone";
  placeholder?: string;
}

const SECTIONS: { title: string; fields: FieldConfig[] }[] = [
  {
    title: "Personal Info",
    fields: [
      { key: "custom_id", label: "Recruiter ID", placeholder: "e.g. REC001 (optional, auto-generated if empty)" },
      { key: "full_name", label: "Full Name", required: true, placeholder: "Enter full name" },
      { key: "dob", label: "Date of Birth", type: "date", placeholder: "YYYY-MM-DD" },
      { key: "gender", label: "Gender", type: "gender" },
      { key: "blood_group", label: "Blood Group", type: "blood_group" },
      { key: "marital_status", label: "Marital Status", type: "marital_status" },
      { key: "qualification", label: "Qualification", placeholder: "e.g. B.Tech, MBA" },
    ],
  },
  {
    title: "Contact",
    fields: [
      { key: "contact_number", label: "Contact Number", type: "phone", placeholder: "10 digits" },
      { key: "email", label: "Email", type: "email", placeholder: "example@email.com" },
      { key: "address", label: "Address", placeholder: "Full address" },
      { key: "emergency_contact", label: "Emergency Contact", type: "phone", placeholder: "10 digits" },
    ],
  },
  {
    title: "Employment",
    fields: [
      { key: "designation", label: "Designation", placeholder: "e.g. Senior Recruiter" },
      { key: "employment_type", label: "Employment Type", placeholder: "Full-time / Part-time / Contract" },
      { key: "date_of_joining", label: "Date of Joining", type: "date", placeholder: "YYYY-MM-DD" },
      { key: "username", label: "Username", required: true, placeholder: "Unique username" },
      { key: "password", label: "Password", required: true, secure: true, placeholder: "Min 6 characters" },
    ],
  },
  {
    title: "Statutory",
    fields: [
      { key: "aadhar_number", label: "Aadhar Number", type: "aadhar", placeholder: "12 digits" },
      { key: "pan_number", label: "PAN Number", type: "pan", placeholder: "ABCDE1234F" },
      { key: "pf_number", label: "PF Number", placeholder: "PF account number" },
      { key: "esi_number", label: "ESI Number", placeholder: "ESI number" },
      { key: "uan_number", label: "UAN Number", placeholder: "UAN number" },
    ],
  },
  {
    title: "Bank Details",
    fields: [
      { key: "bank_name", label: "Bank Name", placeholder: "e.g. SBI, HDFC" },
      { key: "bank_branch", label: "Branch", placeholder: "Branch name" },
      { key: "account_number", label: "Account Number", placeholder: "Bank account number" },
      { key: "ifsc_code", label: "IFSC Code", placeholder: "SBIN0001234" },
    ],
  },
  {
    title: "Transport",
    fields: [
      { key: "driving_license_number", label: "Driving License No.", placeholder: "License number" },
      { key: "vehicle_details", label: "Vehicle Details", placeholder: "e.g. Honda Activa KA03AB1234" },
    ],
  },
];

function validateField(field: FieldConfig, value: string): string | null {
  if (field.required && !value.trim()) return `${field.label} is required`;
  
  switch (field.type) {
    case "date":
      if (value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "Format: YYYY-MM-DD";
      if (value) {
        const date = new Date(value);
        if (isNaN(date.getTime())) return "Invalid date";
      }
      break;
    case "aadhar":
      if (value && !/^\d{12}$/.test(value)) return "Must be exactly 12 digits";
      break;
    case "pan":
      if (value && !/^[A-Z]{5}\d{4}[A-Z]$/.test(value)) return "Format: ABCDE1234F";
      break;
    case "email":
      if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return "Invalid email format";
      break;
    case "phone":
      if (value && !/^\d{10}$/.test(value)) return "Must be exactly 10 digits";
      break;
  }
  return null;
}

export default function AddRecruiterScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const c = colors.light;
  const [form, setForm] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [workplaceId, setWorkplaceId] = useState("");
  const [loading, setLoading] = useState(false);
  const [addingWorkplace, setAddingWorkplace] = useState(false);
  const [newWorkplaceName, setNewWorkplaceName] = useState("");
  const [savingWorkplace, setSavingWorkplace] = useState(false);

  const qc = useQueryClient();

  const { data: workplaces } = useQuery<Workplace[]>({
    queryKey: ["workplaces"],
    queryFn: () => apiFetch("/workplaces"),
  });

  const set = (key: string, val: string) => {
    setForm((f) => ({ ...f, [key]: val }));
    if (errors[key]) setErrors((e) => { const ne = { ...e }; delete ne[key]; return ne; });
  };

  const validateAll = (): boolean => {
    const newErrors: Record<string, string> = {};
    SECTIONS.forEach((section) => {
      section.fields.forEach((field) => {
        const error = validateField(field, form[field.key] ?? "");
        if (error) newErrors[field.key] = error;
      });
    });
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validateAll()) {
      Toast.show({ type: "error", text1: "Please fix validation errors" });
      return;
    }
    if (!form["full_name"] || !form["username"] || !form["password"]) {
      Toast.show({ type: "error", text1: "Full name, username, and password are required" });
      return;
    }
    setLoading(true);
    try {
      await apiFetch("/employees", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          role: "recruiter",
          workplace_id: workplaceId || undefined,
        }),
      });
      Toast.show({ type: "success", text1: "Recruiter created!" });
      router.back();
    } catch (e: unknown) {
      Toast.show({ type: "error", text1: "Failed", text2: e instanceof Error ? e.message : "Error" });
    } finally {
      setLoading(false);
    }
  };

  const renderField = (field: FieldConfig) => {
    const value = form[field.key] ?? "";
    const error = errors[field.key];
    const isRequired = field.required;

    if (field.type === "gender") {
      return (
        <View key={field.key} style={styles.fieldGroup}>
          <Text style={[styles.label, { color: c.mutedForeground, fontFamily: "Inter_500Medium" }]}>
            {field.label} {isRequired && <Text style={{ color: c.destructive }}>*</Text>}
          </Text>
          <View style={styles.pillRow}>
            {GENDER_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option}
                onPress={() => set(field.key, option)}
                style={[styles.pill, { backgroundColor: value === option ? c.navy : c.muted }]}
              >
                <Text style={[styles.pillText, { color: value === option ? c.white : c.mutedForeground, fontFamily: "Inter_500Medium" }]}>{option}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {error && <Text style={[styles.errorText, { color: c.destructive }]}>{error}</Text>}
        </View>
      );
    }

    if (field.type === "blood_group") {
      return (
        <View key={field.key} style={styles.fieldGroup}>
          <Text style={[styles.label, { color: c.mutedForeground, fontFamily: "Inter_500Medium" }]}>
            {field.label} {isRequired && <Text style={{ color: c.destructive }}>*</Text>}
          </Text>
          <View style={styles.pillRow}>
            {BLOOD_GROUP_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option}
                onPress={() => set(field.key, option)}
                style={[styles.pill, { backgroundColor: value === option ? c.navy : c.muted }]}
              >
                <Text style={[styles.pillText, { color: value === option ? c.white : c.mutedForeground, fontFamily: "Inter_500Medium" }]}>{option}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {error && <Text style={[styles.errorText, { color: c.destructive }]}>{error}</Text>}
        </View>
      );
    }

    if (field.type === "marital_status") {
      return (
        <View key={field.key} style={styles.fieldGroup}>
          <Text style={[styles.label, { color: c.mutedForeground, fontFamily: "Inter_500Medium" }]}>
            {field.label} {isRequired && <Text style={{ color: c.destructive }}>*</Text>}
          </Text>
          <View style={styles.pillRow}>
            {MARITAL_STATUS_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option}
                onPress={() => set(field.key, option)}
                style={[styles.pill, { backgroundColor: value === option ? c.navy : c.muted }]}
              >
                <Text style={[styles.pillText, { color: value === option ? c.white : c.mutedForeground, fontFamily: "Inter_500Medium" }]}>{option}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {error && <Text style={[styles.errorText, { color: c.destructive }]}>{error}</Text>}
        </View>
      );
    }

    if (field.type === "date") {
      return (
        <View key={field.key} style={styles.fieldGroup}>
          <Text style={[styles.label, { color: c.mutedForeground, fontFamily: "Inter_500Medium" }]}>
            {field.label} {isRequired && <Text style={{ color: c.destructive }}>*</Text>}
          </Text>
          <TextInput
            style={[styles.input, { borderColor: error ? c.destructive : c.border, backgroundColor: c.offwhite, color: c.text, fontFamily: "Inter_400Regular" }]}
            value={value}
            onChangeText={(v) => set(field.key, v)}
            placeholder={field.placeholder}
            placeholderTextColor={c.mutedForeground}
            autoCapitalize="none"
            keyboardType="numbers-and-punctuation"
            maxLength={10}
          />
          <Text style={[styles.hintText, { color: c.mutedForeground }]}>Format: YYYY-MM-DD</Text>
          {error && <Text style={[styles.errorText, { color: c.destructive }]}>{error}</Text>}
        </View>
      );
    }

    return (
      <View key={field.key} style={styles.fieldGroup}>
        <Text style={[styles.label, { color: c.mutedForeground, fontFamily: "Inter_500Medium" }]}>
          {field.label} {isRequired && <Text style={{ color: c.destructive }}>*</Text>}
        </Text>
        <TextInput
          style={[styles.input, { borderColor: error ? c.destructive : c.border, backgroundColor: c.offwhite, color: c.text, fontFamily: "Inter_400Regular" }]}
          value={value}
          onChangeText={(v) => set(field.key, v)}
          placeholder={field.placeholder || field.label}
          placeholderTextColor={c.mutedForeground}
          secureTextEntry={!!field.secure}
          autoCapitalize="none"
          keyboardType={field.type === "phone" || field.type === "aadhar" ? "number-pad" : field.type === "email" ? "email-address" : "default"}
          maxLength={field.type === "aadhar" ? 12 : field.type === "phone" ? 10 : field.type === "pan" ? 10 : undefined}
        />
        {field.type === "aadhar" && <Text style={[styles.hintText, { color: c.mutedForeground }]}>Exactly 12 digits</Text>}
        {field.type === "pan" && <Text style={[styles.hintText, { color: c.mutedForeground }]}>Format: ABCDE1234F</Text>}
        {field.type === "phone" && <Text style={[styles.hintText, { color: c.mutedForeground }]}>Exactly 10 digits</Text>}
        {error && <Text style={[styles.errorText, { color: c.destructive }]}>{error}</Text>}
      </View>
    );
  };

  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <NavHeader title="Add Recruiter" showBack />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: bottomPad + 80 }} keyboardShouldPersistTaps="handled">
        {SECTIONS.map((section) => (
          <View key={section.title} style={[styles.section, { backgroundColor: c.white }]}>
            <Text style={[styles.sectionTitle, { color: c.navy, fontFamily: "Poppins_700Bold" }]}>{section.title}</Text>
            {section.fields.map((field) => renderField(field))}
          </View>
        ))}

        {/* Workplace picker */}
        <View style={[styles.section, { backgroundColor: c.white }]}>
          <Text style={[styles.sectionTitle, { color: c.navy, fontFamily: "Poppins_700Bold" }]}>Workplace</Text>
          <View style={styles.pillRow}>
            {(workplaces ?? []).map((w) => (
              <TouchableOpacity
                key={w.id}
                onPress={() => { setWorkplaceId(w.id); setAddingWorkplace(false); }}
                style={[styles.pill, { backgroundColor: workplaceId === w.id ? c.navy : c.muted }]}
              >
                <Text style={[styles.pillText, { color: workplaceId === w.id ? c.white : c.mutedForeground, fontFamily: "Inter_500Medium" }]}>{w.name}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              onPress={() => { setAddingWorkplace(true); setWorkplaceId(""); }}
              style={[styles.pill, { backgroundColor: addingWorkplace ? c.navy : c.muted, borderStyle: "dashed", borderWidth: 1, borderColor: c.navy }]}
            >
              <Text style={[styles.pillText, { color: addingWorkplace ? c.white : c.navy, fontFamily: "Inter_500Medium" }]}>+ Add New</Text>
            </TouchableOpacity>
          </View>

          {addingWorkplace && (
            <View style={{ marginTop: 12, flexDirection: "row", gap: 8 }}>
              <TextInput
                style={[styles.input, { flex: 1, borderColor: c.border, backgroundColor: c.offwhite, color: c.text, fontFamily: "Inter_400Regular" }]}
                value={newWorkplaceName}
                onChangeText={setNewWorkplaceName}
                placeholder="Enter workplace name"
                placeholderTextColor={c.mutedForeground}
                autoCapitalize="words"
              />
              <TouchableOpacity
                onPress={async () => {
                  if (!newWorkplaceName.trim()) {
                    Toast.show({ type: "error", text1: "Workplace name is required" });
                    return;
                  }
                  setSavingWorkplace(true);
                  try {
                    const created = await apiFetch<Workplace>("/workplaces", {
                      method: "POST",
                      body: JSON.stringify({ name: newWorkplaceName.trim() }),
                    });
                    Toast.show({ type: "success", text1: "Workplace added!" });
                    setWorkplaceId(created.id);
                    setAddingWorkplace(false);
                    setNewWorkplaceName("");
                    qc.invalidateQueries({ queryKey: ["workplaces"] });
                  } catch (e: unknown) {
                    Toast.show({ type: "error", text1: "Failed to add workplace", text2: e instanceof Error ? e.message : "Error" });
                  } finally {
                    setSavingWorkplace(false);
                  }
                }}
                style={[styles.pill, { backgroundColor: c.gold, paddingHorizontal: 16 }]}
                disabled={savingWorkplace}
              >
                {savingWorkplace ? <ActivityIndicator color={c.navy} size="small" /> : <Text style={[styles.pillText, { color: c.navy, fontFamily: "Inter_600SemiBold" }]}>Save</Text>}
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ScrollView>

      <View style={[styles.bottomBar, { backgroundColor: c.white, paddingBottom: bottomPad + 8 }]}>
        <TouchableOpacity onPress={() => router.replace("/(admin)/dashboard")} style={[styles.cancelBtn, { borderColor: c.border }]}>
          <Text style={[styles.cancelText, { color: c.mutedForeground, fontFamily: "Inter_500Medium" }]}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleSave} style={[styles.saveBtn, { backgroundColor: c.gold }]} disabled={loading}>
          {loading ? <ActivityIndicator color={c.navy} /> : <Text style={[styles.saveBtnText, { color: c.navy, fontFamily: "Poppins_700Bold" }]}>Save Recruiter</Text>}
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
  errorText: { fontSize: 11, marginTop: 4, fontFamily: "Inter_500Medium" },
  hintText: { fontSize: 11, marginTop: 2, fontFamily: "Inter_400Regular" },
  bottomBar: { flexDirection: "row", gap: 12, paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: "#E5E7EB" },
  cancelBtn: { flex: 1, borderWidth: 1, borderRadius: 8, alignItems: "center", paddingVertical: 13 },
  cancelText: { fontSize: 15 },
  saveBtn: { flex: 2, borderRadius: 8, alignItems: "center", paddingVertical: 13 },
  saveBtnText: { fontSize: 15 },
});