import React, { useState, useEffect } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Platform,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Toast from "react-native-toast-message";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { NavHeader } from "@/components/NavHeader";
import colors from "@/constants/colors";

interface Workplace { id: string; name: string; }

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const EDITABLE_FIELDS = [
  { key: "full_name", label: "Full Name", required: true },
  { key: "contact_number", label: "Contact Number" },
  { key: "email", label: "Email" },
  { key: "address", label: "Address" },
  { key: "emergency_contact", label: "Emergency Contact" },
  { key: "employment_type", label: "Employment Type" },
  { key: "aadhar_number", label: "Aadhar Number" },
  { key: "pan_number", label: "PAN Number" },
  { key: "pf_number", label: "PF Number" },
  { key: "esi_number", label: "ESI Number" },
  { key: "uan_number", label: "UAN Number" },
  { key: "bank_name", label: "Bank Name" },
  { key: "bank_branch", label: "Branch" },
  { key: "account_number", label: "Account Number" },
  { key: "ifsc_code", label: "IFSC Code" },
  { key: "driving_license_number", label: "Driving License No." },
  { key: "vehicle_details", label: "Vehicle Details" },
];

interface Recruiter {
  id: string; full_name: string; designation?: string | null;
  contact_number?: string | null; email?: string | null;
  address?: string | null; emergency_contact?: string | null;
  employment_type?: string | null; aadhar_number?: string | null;
  pan_number?: string | null; pf_number?: string | null;
  esi_number?: string | null; uan_number?: string | null;
  bank_name?: string | null; bank_branch?: string | null;
  account_number?: string | null; ifsc_code?: string | null;
  driving_license_number?: string | null; vehicle_details?: string | null;
  shift_start_time?: string | null; shift_end_time?: string | null;
  shift_days?: string | null;
  workplace_id?: string | null;
  dob?: string | null;
  gender?: string | null;
  blood_group?: string | null;
  qualification?: string | null;
  marital_status?: string | null;
  date_of_joining?: string | null;
}

export default function AdminEditRecruiterScreen() {
  const { id } = useLocalSearchParams() as { id: string };
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const c = colors.light;
  const [form, setForm] = useState<Record<string, string>>({});
  const [designation, setDesignation] = useState("");
  const [shiftStart, setShiftStart] = useState("");
  const [shiftEnd, setShiftEnd] = useState("");
  const [shiftDays, setShiftDays] = useState<string[]>([]);
  const [workplaceId, setWorkplaceId] = useState("");
  const [loading, setLoading] = useState(false);
  const qc = useQueryClient();

  const { data: recruiter, isLoading } = useQuery<Recruiter>({
    queryKey: ["recruiter-edit", id],
    queryFn: () => apiFetch(`/employees/${id}`),
    enabled: !!id,
  });

  const { data: workplaces } = useQuery<Workplace[]>({
    queryKey: ["workplaces"],
    queryFn: () => apiFetch("/workplaces"),
  });

  const { data: designations } = useQuery<string[]>({
    queryKey: ["designations"],
    queryFn: () => apiFetch("/designations"),
  });

  useEffect(() => {
    if (recruiter) {
      const initialForm: Record<string, string> = {};
      EDITABLE_FIELDS.forEach(field => {
        const val = recruiter[field.key as keyof Recruiter];
        initialForm[field.key] = val ? String(val) : "";
      });
      initialForm["dob"] = recruiter.dob ?? "";
      initialForm["gender"] = recruiter.gender ?? "";
      initialForm["blood_group"] = recruiter.blood_group ?? "";
      initialForm["qualification"] = recruiter.qualification ?? "";
      initialForm["marital_status"] = recruiter.marital_status ?? "";
      initialForm["date_of_joining"] = recruiter.date_of_joining ?? "";
      
      setForm(initialForm);
      setDesignation(recruiter.designation ?? "");
      setShiftStart(recruiter.shift_start_time ?? "09:00 AM");
      setShiftEnd(recruiter.shift_end_time ?? "06:00 PM");
      setShiftDays(recruiter.shift_days ? recruiter.shift_days.split(",") : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
      setWorkplaceId(recruiter.workplace_id ?? "");
    }
  }, [recruiter]);

  const set = (key: string, val: string) => setForm((f) => ({ ...f, [key]: val }));

  const toggleDay = (day: string) => {
    setShiftDays(prev => 
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    );
  };

  const handleSave = async () => {
    if (!form["full_name"]) {
      Toast.show({ type: "error", text1: "Full name is required" });
      return;
    }
    setLoading(true);
    try {
      const updateData: Record<string, unknown> = {
        ...form,
        designation: designation || undefined,
        shift_start_time: shiftStart,
        shift_end_time: shiftEnd,
        shift_days: shiftDays.join(","),
        workplace_id: workplaceId || undefined,
      };
      
      Object.keys(updateData).forEach(key => {
        if (updateData[key] === "") delete updateData[key];
      });

      await apiFetch(`/employees/${id}`, {
        method: "PUT",
        body: JSON.stringify(updateData),
      });
      Toast.show({ type: "success", text1: "Recruiter updated!" });
      qc.invalidateQueries({ queryKey: ["employees"] });
      qc.invalidateQueries({ queryKey: ["recruiter-edit", id] });
      qc.invalidateQueries({ queryKey: ["recruiter-oversight", id] });
      qc.invalidateQueries({ queryKey: ["admin-dashboard"] });
      router.back();
    } catch (e: unknown) {
      Toast.show({ type: "error", text1: "Failed", text2: e instanceof Error ? e.message : "Error" });
    } finally {
      setLoading(false);
    }
  };

  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: c.background, justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator size="large" color={c.navy} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <NavHeader title="Edit Recruiter" showBack />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: bottomPad + 80 }} keyboardShouldPersistTaps="handled">
        {/* Personal Info */}
        <View style={[styles.section, { backgroundColor: c.white }]}>
          <Text style={[styles.sectionTitle, { color: c.navy, fontFamily: "Poppins_700Bold" }]}>Personal Info</Text>
          {[
            { key: "full_name", label: "Full Name *", required: true },
            { key: "dob", label: "Date of Birth (YYYY-MM-DD)" },
            { key: "gender", label: "Gender (Male/Female/Other)" },
            { key: "blood_group", label: "Blood Group" },
            { key: "qualification", label: "Qualification" },
            { key: "marital_status", label: "Marital Status" },
          ].map((field) => (
            <View key={field.key} style={styles.fieldGroup}>
              <Text style={[styles.label, { color: c.mutedForeground, fontFamily: "Inter_500Medium" }]}>{field.label}</Text>
              <TextInput
                style={[styles.input, { borderColor: c.border, backgroundColor: c.offwhite, color: c.text, fontFamily: "Inter_400Regular" }]}
                value={form[field.key] ?? ""}
                onChangeText={(v) => set(field.key, v)}
                placeholder={field.label}
                placeholderTextColor={c.mutedForeground}
                autoCapitalize="none"
              />
            </View>
          ))}
        </View>

        {/* Contact */}
        <View style={[styles.section, { backgroundColor: c.white }]}>
          <Text style={[styles.sectionTitle, { color: c.navy, fontFamily: "Poppins_700Bold" }]}>Contact</Text>
          {[
            { key: "contact_number", label: "Contact Number" },
            { key: "email", label: "Email" },
            { key: "address", label: "Address" },
            { key: "emergency_contact", label: "Emergency Contact" },
          ].map((field) => (
            <View key={field.key} style={styles.fieldGroup}>
              <Text style={[styles.label, { color: c.mutedForeground, fontFamily: "Inter_500Medium" }]}>{field.label}</Text>
              <TextInput
                style={[styles.input, { borderColor: c.border, backgroundColor: c.offwhite, color: c.text, fontFamily: "Inter_400Regular" }]}
                value={form[field.key] ?? ""}
                onChangeText={(v) => set(field.key, v)}
                placeholder={field.label}
                placeholderTextColor={c.mutedForeground}
                autoCapitalize="none"
              />
            </View>
          ))}
        </View>

        {/* Employment */}
        <View style={[styles.section, { backgroundColor: c.white }]}>
          <Text style={[styles.sectionTitle, { color: c.navy, fontFamily: "Poppins_700Bold" }]}>Employment</Text>
          {[
            { key: "employment_type", label: "Employment Type" },
            { key: "date_of_joining", label: "Date of Joining (YYYY-MM-DD)" },
          ].map((field) => (
            <View key={field.key} style={styles.fieldGroup}>
              <Text style={[styles.label, { color: c.mutedForeground, fontFamily: "Inter_500Medium" }]}>{field.label}</Text>
              <TextInput
                style={[styles.input, { borderColor: c.border, backgroundColor: c.offwhite, color: c.text, fontFamily: "Inter_400Regular" }]}
                value={form[field.key] ?? ""}
                onChangeText={(v) => set(field.key, v)}
                placeholder={field.label}
                placeholderTextColor={c.mutedForeground}
                autoCapitalize="none"
              />
            </View>
          ))}
        </View>

        {/* Designation Picker */}
        <View style={[styles.section, { backgroundColor: c.white }]}>
          <Text style={[styles.sectionTitle, { color: c.navy, fontFamily: "Poppins_700Bold" }]}>Designation</Text>
          <View style={styles.pillRow}>
            {(designations ?? []).map((d) => (
              <TouchableOpacity
                key={d}
                onPress={() => setDesignation(d)}
                style={[styles.pill, { backgroundColor: designation === d ? c.navy : c.muted }]}
              >
                <Text style={[styles.pillText, { color: designation === d ? c.white : c.mutedForeground, fontFamily: "Inter_500Medium" }]}>{d}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Shift Timing */}
        <View style={[styles.section, { backgroundColor: c.white }]}>
          <Text style={[styles.sectionTitle, { color: c.navy, fontFamily: "Poppins_700Bold" }]}>Shift Timing</Text>
          <View style={styles.shiftRow}>
            <View style={styles.shiftField}>
              <Text style={[styles.label, { color: c.mutedForeground, fontFamily: "Inter_500Medium" }]}>Start Time</Text>
              <TextInput
                style={[styles.input, { borderColor: c.border, backgroundColor: c.offwhite, color: c.text, fontFamily: "Inter_400Regular" }]}
                value={shiftStart}
                onChangeText={setShiftStart}
                placeholder="09:00 AM"
                placeholderTextColor={c.mutedForeground}
              />
            </View>
            <View style={styles.shiftField}>
              <Text style={[styles.label, { color: c.mutedForeground, fontFamily: "Inter_500Medium" }]}>End Time</Text>
              <TextInput
                style={[styles.input, { borderColor: c.border, backgroundColor: c.offwhite, color: c.text, fontFamily: "Inter_400Regular" }]}
                value={shiftEnd}
                onChangeText={setShiftEnd}
                placeholder="06:00 PM"
                placeholderTextColor={c.mutedForeground}
              />
            </View>
          </View>
          <Text style={[styles.label, { color: c.mutedForeground, fontFamily: "Inter_500Medium", marginTop: 12 }]}>Working Days</Text>
          <View style={styles.pillRow}>
            {DAYS.map((day) => (
              <TouchableOpacity
                key={day}
                onPress={() => toggleDay(day)}
                style={[styles.dayPill, { 
                  backgroundColor: shiftDays.includes(day) ? c.navy : c.muted,
                  borderWidth: 1,
                  borderColor: shiftDays.includes(day) ? c.navy : c.border
                }]}
              >
                <Text style={[styles.pillText, { 
                  color: shiftDays.includes(day) ? c.white : c.mutedForeground, 
                  fontFamily: "Inter_500Medium" 
                }]}>{day}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

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

        {/* Statutory */}
        <View style={[styles.section, { backgroundColor: c.white }]}>
          <Text style={[styles.sectionTitle, { color: c.navy, fontFamily: "Poppins_700Bold" }]}>Statutory</Text>
          {[
            { key: "aadhar_number", label: "Aadhar Number" },
            { key: "pan_number", label: "PAN Number" },
            { key: "pf_number", label: "PF Number" },
            { key: "esi_number", label: "ESI Number" },
            { key: "uan_number", label: "UAN Number" },
          ].map((field) => (
            <View key={field.key} style={styles.fieldGroup}>
              <Text style={[styles.label, { color: c.mutedForeground, fontFamily: "Inter_500Medium" }]}>{field.label}</Text>
              <TextInput
                style={[styles.input, { borderColor: c.border, backgroundColor: c.offwhite, color: c.text, fontFamily: "Inter_400Regular" }]}
                value={form[field.key] ?? ""}
                onChangeText={(v) => set(field.key, v)}
                placeholder={field.label}
                placeholderTextColor={c.mutedForeground}
                autoCapitalize="none"
              />
            </View>
          ))}
        </View>

        {/* Bank Details */}
        <View style={[styles.section, { backgroundColor: c.white }]}>
          <Text style={[styles.sectionTitle, { color: c.navy, fontFamily: "Poppins_700Bold" }]}>Bank Details</Text>
          {[
            { key: "bank_name", label: "Bank Name" },
            { key: "bank_branch", label: "Branch" },
            { key: "account_number", label: "Account Number" },
            { key: "ifsc_code", label: "IFSC Code" },
          ].map((field) => (
            <View key={field.key} style={styles.fieldGroup}>
              <Text style={[styles.label, { color: c.mutedForeground, fontFamily: "Inter_500Medium" }]}>{field.label}</Text>
              <TextInput
                style={[styles.input, { borderColor: c.border, backgroundColor: c.offwhite, color: c.text, fontFamily: "Inter_400Regular" }]}
                value={form[field.key] ?? ""}
                onChangeText={(v) => set(field.key, v)}
                placeholder={field.label}
                placeholderTextColor={c.mutedForeground}
                autoCapitalize="none"
              />
            </View>
          ))}
        </View>

        {/* Transport */}
        <View style={[styles.section, { backgroundColor: c.white }]}>
          <Text style={[styles.sectionTitle, { color: c.navy, fontFamily: "Poppins_700Bold" }]}>Transport</Text>
          {[
            { key: "driving_license_number", label: "Driving License No." },
            { key: "vehicle_details", label: "Vehicle Details" },
          ].map((field) => (
            <View key={field.key} style={styles.fieldGroup}>
              <Text style={[styles.label, { color: c.mutedForeground, fontFamily: "Inter_500Medium" }]}>{field.label}</Text>
              <TextInput
                style={[styles.input, { borderColor: c.border, backgroundColor: c.offwhite, color: c.text, fontFamily: "Inter_400Regular" }]}
                value={form[field.key] ?? ""}
                onChangeText={(v) => set(field.key, v)}
                placeholder={field.label}
                placeholderTextColor={c.mutedForeground}
                autoCapitalize="none"
              />
            </View>
          ))}
        </View>
      </ScrollView>

      <View style={[styles.bottomBar, { backgroundColor: c.white, paddingBottom: bottomPad + 8 }]}>
        <TouchableOpacity onPress={router.back} style={[styles.cancelBtn, { borderColor: c.border }]}>
          <Text style={[styles.cancelText, { color: c.mutedForeground, fontFamily: "Inter_500Medium" }]}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleSave} style={[styles.saveBtn, { backgroundColor: c.gold }]} disabled={loading}>
          {loading ? <ActivityIndicator color={c.navy} /> : <Text style={[styles.saveBtnText, { color: c.navy, fontFamily: "Poppins_700Bold" }]}>Update Recruiter</Text>}
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
  dayPill: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, minWidth: 44, alignItems: "center" },
  pillText: { fontSize: 13 },
  shiftRow: { flexDirection: "row", gap: 12 },
  shiftField: { flex: 1 },
  bottomBar: { flexDirection: "row", gap: 12, paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: "#E5E7EB" },
  cancelBtn: { flex: 1, borderWidth: 1, borderRadius: 8, alignItems: "center", paddingVertical: 13 },
  cancelText: { fontSize: 15 },
  saveBtn: { flex: 2, borderRadius: 8, alignItems: "center", paddingVertical: 13 },
  saveBtnText: { fontSize: 15 },
});