import React from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform, Alert,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Toast from "react-native-toast-message";
import { apiFetch } from "@/lib/api";
import { NavHeader } from "@/components/NavHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { LoadingScreen } from "@/components/LoadingScreen";
import colors from "@/constants/colors";

interface Employee {
  id: string; full_name: string; employee_code: string; designation?: string | null;
  email?: string | null; contact_number?: string | null; address?: string | null;
  gender?: string | null; dob?: string | null; blood_group?: string | null;
  qualification?: string | null; marital_status?: string | null;
  employment_status?: string | null; employment_type?: string | null;
  date_of_joining?: string | null; workplace?: { name: string; client_name?: string | null } | null;
  pf_number?: string | null; esi_number?: string | null; uan_number?: string | null;
  bank_name?: string | null; account_number?: string | null; ifsc_code?: string | null;
  pan_number?: string | null; aadhar_number?: string | null;
  driving_license_number?: string | null; vehicle_details?: string | null;
  username?: string | null; role?: string | null;
  custom_id?: string | null;
  shift_start_time?: string | null; shift_end_time?: string | null; shift_days?: string | null;
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  const c = colors.light;
  if (!value) return null;
  return (
    <View style={styles.infoRow}>
      <Text style={[styles.infoLabel, { color: c.mutedForeground, fontFamily: "Inter_500Medium" }]}>{label}</Text>
      <Text style={[styles.infoValue, { color: c.text, fontFamily: "Inter_400Regular" }]}>{value}</Text>
    </View>
  );
}

export default function RecruiterEmployeeDetailScreen() {
  const params = useLocalSearchParams();
  const id = params.id as string;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const c = colors.light;
  const qc = useQueryClient();

  const { data: employee, isLoading } = useQuery<Employee>({
    queryKey: ["recruiter-employee", id],
    queryFn: () => apiFetch(`/employees/${id}`),
  });

  const [showDeactivateConfirm, setShowDeactivateConfirm] = React.useState(false);

  const handleDelete = async () => {
    if (!employee || !id) {
      Toast.show({ type: "error", text1: "Error", text2: "Employee ID not found" });
      return;
    }
    try {
      await apiFetch(`/employees/${id}`, { method: "DELETE" });
      Toast.show({ type: "success", text1: "Employee deactivated" });
      qc.invalidateQueries({ queryKey: ["recruiter-employees"] });
      qc.invalidateQueries({ queryKey: ["recruiter-dashboard"] });
      router.back();
    } catch (e: unknown) {
      let errorMsg = "Error";
      if (e instanceof Error) {
        errorMsg = e.message;
        try {
          const parsed = JSON.parse(e.message);
          if (parsed.error) errorMsg = parsed.error;
        } catch { /* not JSON */ }
      }
      Toast.show({ type: "error", text1: "Failed to deactivate", text2: errorMsg });
    }
  };

  if (isLoading) return <LoadingScreen />;
  if (!employee) return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
      <Text>Employee not found</Text>
    </View>
  );

  const SECTIONS = [
    { title: "Personal", rows: [
      ["Full Name", employee.full_name], ["Code", employee.employee_code],
      ["DOB", employee.dob], ["Gender", employee.gender], ["Blood Group", employee.blood_group],
      ["Qualification", employee.qualification], ["Marital Status", employee.marital_status],
    ]},
    { title: "Contact", rows: [
      ["Email", employee.email], ["Phone", employee.contact_number],
      ["Address", employee.address],
    ]},
    { title: "Employment", rows: [
      ["Designation", employee.designation], ["Status", employee.employment_status],
      ["Type", employee.employment_type], ["Joined", employee.date_of_joining],
      ["Workplace", employee.workplace?.name], ["Role", employee.role],
      ["Username", employee.username],
    ]},
    { title: "Shift", rows: [
      ["Start Time", employee.shift_start_time], ["End Time", employee.shift_end_time],
      ["Working Days", employee.shift_days],
    ]},
    { title: "Statutory", rows: [
      ["Aadhar", employee.aadhar_number], ["PAN", employee.pan_number],
      ["PF", employee.pf_number], ["ESI", employee.esi_number], ["UAN", employee.uan_number],
    ]},
    { title: "Bank", rows: [
      ["Bank", employee.bank_name], ["Account", employee.account_number], ["IFSC", employee.ifsc_code],
    ]},
    { title: "Transport", rows: [
      ["License", employee.driving_license_number], ["Vehicle", employee.vehicle_details],
    ]},
  ];

  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <NavHeader title={employee.full_name} id={employee.custom_id ?? employee.employee_code} showBack />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: bottomPad + 32 }}>
        {/* Hero */}
        <View style={[styles.hero, { backgroundColor: c.navy }]}>
          <View style={[styles.avatar, { backgroundColor: c.teal }]}>
            <Text style={[styles.avatarText, { color: c.white, fontFamily: "Poppins_700Bold" }]}>
              {employee.full_name.charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.heroName, { color: c.white, fontFamily: "Poppins_700Bold" }]}>{employee.full_name}</Text>
            <Text style={[styles.heroSub, { color: c.gold, fontFamily: "Inter_400Regular" }]}>
              {employee.designation ?? "—"} · {employee.workplace?.name ?? "No workplace"}
            </Text>
            {employee.shift_start_time && employee.shift_end_time && (
              <Text style={[styles.shiftInfo, { color: c.white, fontFamily: "Inter_500Medium" }]}>
                <Feather name="clock" size={12} color={c.gold} /> Shift: {employee.shift_start_time} - {employee.shift_end_time} ({employee.shift_days})
              </Text>
            )}
          </View>
          <StatusBadge status={employee.employment_status ?? "pending"} />
        </View>

        {SECTIONS.map((section) => (
          <View key={section.title} style={[styles.section, { backgroundColor: c.white }]}>
            <Text style={[styles.sectionTitle, { color: c.navy, fontFamily: "Poppins_700Bold" }]}>{section.title}</Text>
            {section.rows.map(([label, val]) => <InfoRow key={label} label={label ?? ""} value={val} />)}
          </View>
        ))}

        {/* Actions */}
        <View style={styles.actionsContainer}>
          <TouchableOpacity
            onPress={() => router.push({ pathname: "/(recruiter)/employees/edit", params: { id: employee.id } } as any)}
            style={[styles.actionBtn, { backgroundColor: c.teal }]}
          >
            <Feather name="edit-2" size={16} color={c.white} />
            <Text style={[styles.actionText, { color: c.white, fontFamily: "Inter_600SemiBold" }]}>Edit Employee</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setShowDeactivateConfirm(true)}
            style={[styles.actionBtn, { backgroundColor: c.destructive }]}
          >
            <Feather name="trash-2" size={16} color={c.white} />
            <Text style={[styles.actionText, { color: c.white, fontFamily: "Inter_600SemiBold" }]}>Deactivate</Text>
          </TouchableOpacity>
        </View>

        {/* Deactivate confirmation */}
        {showDeactivateConfirm && (
          <View style={[styles.section, { backgroundColor: c.white, marginTop: 12 }]}>
            <Text style={[styles.sectionTitle, { color: c.navy, fontFamily: "Poppins_700Bold" }]}>
              Confirm Deactivation
            </Text>
            <Text style={{ color: c.text, fontFamily: "Inter_400Regular", fontSize: 14, marginBottom: 12 }}>
              Are you sure you want to deactivate {employee.full_name}?
            </Text>
            <View style={{ flexDirection: "row", gap: 12 }}>
              <TouchableOpacity
                onPress={() => setShowDeactivateConfirm(false)}
                style={[styles.actionBtn, { flex: 1, backgroundColor: c.muted }]}
              >
                <Text style={[styles.actionText, { color: c.mutedForeground, fontFamily: "Inter_600SemiBold" }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleDelete}
                style={[styles.actionBtn, { flex: 1, backgroundColor: c.destructive }]}
              >
                <Text style={[styles.actionText, { color: c.white, fontFamily: "Inter_600SemiBold" }]}>Deactivate</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  hero: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderRadius: 12, marginBottom: 12 },
  avatar: { width: 52, height: 52, borderRadius: 26, justifyContent: "center", alignItems: "center" },
  avatarText: { fontSize: 22 },
  heroName: { fontSize: 17 },
  heroSub: { fontSize: 13, marginTop: 2 },
  shiftInfo: { fontSize: 12, marginTop: 4 },
  section: { borderRadius: 10, padding: 16, marginBottom: 12, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  sectionTitle: { fontSize: 14, marginBottom: 10 },
  infoRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: "#F3F4F6" },
  infoLabel: { fontSize: 13, flex: 1 },
  infoValue: { fontSize: 13, flex: 2, textAlign: "right" },
  actionsContainer: { flexDirection: "row", gap: 12, marginTop: 8 },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, borderRadius: 8 },
  actionText: { fontSize: 14 },
});