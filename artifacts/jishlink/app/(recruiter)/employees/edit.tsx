import React, { useState, useEffect } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Platform, Alert,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Toast from "react-native-toast-message";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { NavHeader } from "@/components/NavHeader";
import colors from "@/constants/colors";

// Designations now fetched from API

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

interface Employee {
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
}

export default function RecruiterEditEmployeeScreen() {
  const { id } = useLocalSearchParams() as { id: string };
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const c = colors.light;
  const [form, setForm] = useState<Record<string, string>>({});
  const [designation, setDesignation] = useState("");
  const [newDesignation, setNewDesignation] = useState("");
  const [addingDesignation, setAddingDesignation] = useState(false);
  const [editingDesignation, setEditingDesignation] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [deletingDesignation, setDeletingDesignation] = useState<string | null>(null);
  const [shiftStart, setShiftStart] = useState("");
  const [shiftEnd, setShiftEnd] = useState("");
  const [shiftDays, setShiftDays] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const qc = useQueryClient();

  const { data: employee, isLoading } = useQuery<Employee>({
    queryKey: ["recruiter-employee", id],
    queryFn: () => apiFetch(`/employees/${id}`),
    enabled: !!id,
  });

  const { data: designations, refetch: refetchDesignations } = useQuery<string[]>({
    queryKey: ["designations"],
    queryFn: () => apiFetch("/designations"),
  });

  useEffect(() => {
    if (employee) {
      const initialForm: Record<string, string> = {};
      EDITABLE_FIELDS.forEach(field => {
        const val = employee[field.key as keyof Employee];
        initialForm[field.key] = val ? String(val) : "";
      });
      setForm(initialForm);
      setDesignation(employee.designation ?? "");
      setShiftStart(employee.shift_start_time ?? "09:00 AM");
      setShiftEnd(employee.shift_end_time ?? "06:00 PM");
      setShiftDays(employee.shift_days ? employee.shift_days.split(",") : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
    }
  }, [employee]);

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
        designation: designation || form["designation"] || undefined,
        shift_start_time: shiftStart,
        shift_end_time: shiftEnd,
        shift_days: shiftDays.join(","),
      };
      
      // Remove empty strings
      Object.keys(updateData).forEach(key => {
        if (updateData[key] === "") delete updateData[key];
      });

      await apiFetch(`/employees/${id}`, {
        method: "PUT",
        body: JSON.stringify(updateData),
      });
      Toast.show({ type: "success", text1: "Employee updated!" });
      qc.invalidateQueries({ queryKey: ["recruiter-employees"] });
      qc.invalidateQueries({ queryKey: ["recruiter-employee", id] });
      qc.invalidateQueries({ queryKey: ["recruiter-dashboard"] });
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
      <NavHeader title="Edit Employee" showBack />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: bottomPad + 80 }} keyboardShouldPersistTaps="handled">
        <View style={[styles.section, { backgroundColor: c.white }]}>
          <Text style={[styles.sectionTitle, { color: c.navy, fontFamily: "Poppins_700Bold" }]}>Employee Details</Text>
          {EDITABLE_FIELDS.map((field) => (
            <View key={field.key} style={styles.fieldGroup}>
              <Text style={[styles.label, { color: c.mutedForeground, fontFamily: "Inter_500Medium" }]}>
                {field.label} {field.required ? "*" : ""}
              </Text>
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

        {/* Designation Picker with Add/Edit/Delete */}
        <View style={[styles.section, { backgroundColor: c.white }]}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <Text style={[styles.sectionTitle, { color: c.navy, fontFamily: "Poppins_700Bold" }]}>Designation</Text>
            <TouchableOpacity onPress={() => setAddingDesignation(!addingDesignation)}>
              <Feather name={addingDesignation ? "x" : "plus"} size={18} color={c.navy} />
            </TouchableOpacity>
          </View>
          
          {addingDesignation && (
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
              <TextInput
                style={[styles.input, { flex: 1, borderColor: c.border, backgroundColor: c.offwhite, color: c.text, fontFamily: "Inter_400Regular" }]}
                value={newDesignation}
                onChangeText={setNewDesignation}
                placeholder="Enter new designation"
                placeholderTextColor={c.mutedForeground}
                autoCapitalize="words"
              />
              <TouchableOpacity
                onPress={async () => {
                  if (!newDesignation.trim()) {
                    Toast.show({ type: "error", text1: "Enter a designation name" });
                    return;
                  }
                  try {
                    await apiFetch("/designations", {
                      method: "POST",
                      body: JSON.stringify({ name: newDesignation.trim() }),
                    });
                    Toast.show({ type: "success", text1: "Designation added!" });
                    setNewDesignation("");
                    setAddingDesignation(false);
                    refetchDesignations();
                  } catch (e: unknown) {
                    Toast.show({ type: "error", text1: "Failed", text2: e instanceof Error ? e.message : "Error" });
                  }
                }}
                style={[styles.pill, { backgroundColor: c.gold, paddingHorizontal: 16 }]}
              >
                <Text style={[styles.pillText, { color: c.navy, fontFamily: "Inter_600SemiBold" }]}>Add</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Inline edit input */}
          {editingDesignation && (
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
              <TextInput
                style={[styles.input, { flex: 1, borderColor: c.border, backgroundColor: c.offwhite, color: c.text, fontFamily: "Inter_400Regular" }]}
                value={editValue}
                onChangeText={setEditValue}
                placeholder="Edit designation"
                placeholderTextColor={c.mutedForeground}
                autoCapitalize="words"
                autoFocus
              />
              <TouchableOpacity
                onPress={async () => {
                  if (!editValue.trim() || editValue.trim() === editingDesignation) {
                    setEditingDesignation(null);
                    return;
                  }
                  try {
                    await apiFetch(`/designations/${encodeURIComponent(editingDesignation)}`, { method: "DELETE" });
                    await apiFetch("/designations", {
                      method: "POST",
                      body: JSON.stringify({ name: editValue.trim() }),
                    });
                    Toast.show({ type: "success", text1: "Designation updated!" });
                    if (designation === editingDesignation) setDesignation(editValue.trim());
                    setEditingDesignation(null);
                    refetchDesignations();
                  } catch (e: unknown) {
                    Toast.show({ type: "error", text1: "Failed", text2: e instanceof Error ? e.message : "Error" });
                  }
                }}
                style={[styles.pill, { backgroundColor: c.gold, paddingHorizontal: 16 }]}
              >
                <Text style={[styles.pillText, { color: c.navy, fontFamily: "Inter_600SemiBold" }]}>Save</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setEditingDesignation(null)}
                style={[styles.pill, { backgroundColor: c.muted, paddingHorizontal: 16 }]}
              >
                <Text style={[styles.pillText, { color: c.mutedForeground, fontFamily: "Inter_500Medium" }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.pillRow}>
            {(designations ?? []).map((d) => (
              <View key={d} style={{ flexDirection: "row", alignItems: "center", marginBottom: 6 }}>
                <TouchableOpacity
                  onPress={() => setDesignation(d)}
                  style={[styles.pill, { backgroundColor: designation === d ? c.navy : c.muted }]}
                >
                  <Text style={[styles.pillText, { color: designation === d ? c.white : c.mutedForeground, fontFamily: "Inter_500Medium" }]}>{d}</Text>
                </TouchableOpacity>
                {/* Edit button */}
                <TouchableOpacity
                  onPress={() => {
                    setEditingDesignation(d);
                    setEditValue(d);
                    setDeletingDesignation(null);
                  }}
                  style={{ marginLeft: 4, padding: 6, minWidth: 32, minHeight: 32, justifyContent: "center", alignItems: "center" }}
                >
                  <Feather name="edit-2" size={12} color={c.mutedForeground} />
                </TouchableOpacity>
                {/* Delete button */}
                <TouchableOpacity
                  onPress={() => setDeletingDesignation(d)}
                  style={{ 
                    marginLeft: 2, 
                    padding: 6, 
                    minWidth: 32, 
                    minHeight: 32, 
                    justifyContent: "center", 
                    alignItems: "center",
                    backgroundColor: deletingDesignation === d ? c.destructive : "rgba(254, 226, 226, 0.3)",
                    borderRadius: 16,
                  }}
                  activeOpacity={0.5}
                >
                  <Feather name="x" size={16} color={deletingDesignation === d ? c.white : c.destructive} />
                </TouchableOpacity>
              </View>
            ))}
          </View>

          {/* Inline delete confirmation */}
          {deletingDesignation && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8, padding: 12, backgroundColor: c.offwhite, borderRadius: 8, borderWidth: 1, borderColor: c.border }}>
              <Text style={{ flex: 1, color: c.text, fontFamily: "Inter_500Medium", fontSize: 14 }}>
                Delete "{deletingDesignation}"?
              </Text>
              <TouchableOpacity
                onPress={() => setDeletingDesignation(null)}
                style={[styles.pill, { backgroundColor: c.muted, paddingHorizontal: 16 }]}
              >
                <Text style={[styles.pillText, { color: c.mutedForeground, fontFamily: "Inter_500Medium" }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={async () => {
                  const d = deletingDesignation;
                  setDeletingDesignation(null);
                  try {
                    await apiFetch(`/designations/${encodeURIComponent(d)}`, { method: "DELETE" });
                    Toast.show({ type: "success", text1: "Designation deleted" });
                    if (designation === d) setDesignation("");
                    refetchDesignations();
                  } catch (e: unknown) {
                    Toast.show({ type: "error", text1: "Failed", text2: e instanceof Error ? e.message : "Error" });
                  }
                }}
                style={[styles.pill, { backgroundColor: c.destructive, paddingHorizontal: 16 }]}
              >
                <Text style={[styles.pillText, { color: c.white, fontFamily: "Inter_600SemiBold" }]}>Delete</Text>
              </TouchableOpacity>
            </View>
          )}
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
      </ScrollView>

      <View style={[styles.bottomBar, { backgroundColor: c.white, paddingBottom: bottomPad + 8 }]}>
        <TouchableOpacity onPress={router.back} style={[styles.cancelBtn, { borderColor: c.border }]}>
          <Text style={[styles.cancelText, { color: c.mutedForeground, fontFamily: "Inter_500Medium" }]}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleSave} style={[styles.saveBtn, { backgroundColor: c.gold }]} disabled={loading}>
          {loading ? <ActivityIndicator color={c.navy} /> : <Text style={[styles.saveBtnText, { color: c.navy, fontFamily: "Poppins_700Bold" }]}>Update Employee</Text>}
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