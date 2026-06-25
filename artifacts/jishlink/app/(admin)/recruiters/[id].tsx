import React, { useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform,
} from "react-native";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Toast from "react-native-toast-message";
import { apiFetch } from "@/lib/api";
import { NavHeader } from "@/components/NavHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { LoadingScreen } from "@/components/LoadingScreen";
import colors from "@/constants/colors";

interface EmployeeStatus {
  employee: {
    id: string; full_name: string; designation?: string | null;
    contact_number?: string | null; shift_start_time?: string | null;
    shift_end_time?: string | null; workplace?: { name: string } | null;
  };
  logged_in: boolean; signed_off: boolean;
  login_time?: string | null; signoff_time?: string | null;
  login_address?: string | null;
  shift_overdue: boolean; has_shift_today: boolean;
  has_absence_note: boolean;
}

interface RecruiterDetail {
  id: string;
  full_name: string;
  designation?: string | null;
  email?: string | null;
  contact_number?: string | null;
  address?: string | null;
  gender?: string | null;
  dob?: string | null;
  blood_group?: string | null;
  qualification?: string | null;
  marital_status?: string | null;
  employment_status?: string | null;
  employment_type?: string | null;
  date_of_joining?: string | null;
  workplace?: { name: string; client_name?: string | null } | null;
  pf_number?: string | null;
  esi_number?: string | null;
  uan_number?: string | null;
  bank_name?: string | null;
  account_number?: string | null;
  ifsc_code?: string | null;
  pan_number?: string | null;
  aadhar_number?: string | null;
  driving_license_number?: string | null;
  vehicle_details?: string | null;
  username?: string | null;
  role?: string | null;
  employee_code?: string | null;
  custom_id?: string | null;
}

interface RecruiterOversight {
  recruiter: RecruiterDetail;
  stats: {
    total_employees: number; signed_in_today: number;
    not_signed_in: number; shift_overdue_count: number;
    absence_notes_this_month: number; reassignments_this_month: number;
  };
  employees: EmployeeStatus[];
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

export default function RecruiterDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const c = colors.light;
  const qc = useQueryClient();
  const [showDeactivateConfirm, setShowDeactivateConfirm] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const { data, isLoading, refetch } = useQuery<RecruiterOversight>({
    queryKey: ["recruiter-oversight", id],
    queryFn: () => apiFetch(`/recruiter-oversight/${id}`),
  });

  useFocusEffect(() => {
    refetch();
  });

  const handleToggleStatus = async () => {
    if (!data?.recruiter || !id) {
      Toast.show({ type: "error", text1: "Error", text2: "Recruiter ID not found" });
      return;
    }
    const isActive = data.recruiter.employment_status === "active";
    try {
      if (isActive) {
        await apiFetch(`/employees/${id}`, { method: "DELETE" });
        Toast.show({ type: "success", text1: "Recruiter deactivated!" });
      } else {
        await apiFetch(`/employees/${id}/activate`, { method: "POST" });
        Toast.show({ type: "success", text1: "Recruiter activated!" });
      }
      qc.invalidateQueries({ queryKey: ["employees"] });
      qc.invalidateQueries({ queryKey: ["recruiter-oversight", id] });
      qc.invalidateQueries({ queryKey: ["admin-dashboard"] });
      setShowDeactivateConfirm(false);
    } catch (e: unknown) {
      let errorMsg = "Error";
      if (e instanceof Error) {
        errorMsg = e.message;
        try {
          const parsed = JSON.parse(e.message);
          if (parsed.error) errorMsg = parsed.error;
        } catch { /* not JSON */ }
      }
      Toast.show({ type: "error", text1: `Failed to ${isActive ? "deactivate" : "activate"}`, text2: errorMsg });
    }
  };

  if (isLoading) return <LoadingScreen />;
  if (!data) return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
      <Text>Recruiter not found</Text>
    </View>
  );

  const { recruiter, stats, employees } = data;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const getStatus = (emp: EmployeeStatus): string => {
    if (emp.signed_off) return "signed_off";
    if (emp.logged_in) return "signed_in";
    return "absent";
  };

  const SECTIONS = [
    { title: "Personal", rows: [
      ["Full Name", recruiter.full_name], ["Code", recruiter.employee_code],
      ["DOB", recruiter.dob], ["Gender", recruiter.gender], ["Blood Group", recruiter.blood_group],
      ["Qualification", recruiter.qualification], ["Marital Status", recruiter.marital_status],
    ]},
    { title: "Contact", rows: [
      ["Email", recruiter.email], ["Phone", recruiter.contact_number],
      ["Address", recruiter.address],
    ]},
    { title: "Employment", rows: [
      ["Recruiter ID", recruiter.custom_id ?? recruiter.employee_code], ["Designation", recruiter.designation],
      ["Status", recruiter.employment_status], ["Type", recruiter.employment_type],
      ["Joined", recruiter.date_of_joining], ["Workplace", recruiter.workplace?.name],
      ["Role", recruiter.role], ["Username", recruiter.username],
    ]},
    { title: "Statutory", rows: [
      ["Aadhar", recruiter.aadhar_number], ["PAN", recruiter.pan_number],
      ["PF", recruiter.pf_number], ["ESI", recruiter.esi_number], ["UAN", recruiter.uan_number],
    ]},
    { title: "Bank", rows: [
      ["Bank", recruiter.bank_name], ["Account", recruiter.account_number], ["IFSC", recruiter.ifsc_code],
    ]},
    { title: "Transport", rows: [
      ["License", recruiter.driving_license_number], ["Vehicle", recruiter.vehicle_details],
    ]},
  ];

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <NavHeader 
        title={recruiter.full_name} 
        id={recruiter.custom_id ?? recruiter.employee_code}
        showBack 
        onBack={() => router.replace("/(admin)/dashboard")}
      />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: bottomPad + 32 }}>
        {/* Hero */}
        <View style={[styles.hero, { backgroundColor: c.navy }]}>
          <View style={[styles.avatar, { backgroundColor: c.teal }]}>
            <Text style={[styles.avatarText, { color: c.white, fontFamily: "Poppins_700Bold" }]}>
              {recruiter.full_name.charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.heroName, { color: c.white, fontFamily: "Poppins_700Bold" }]}>{recruiter.full_name}</Text>
            <Text style={[styles.heroSub, { color: c.gold, fontFamily: "Inter_400Regular" }]}>
              {recruiter.designation ?? "Recruiter"} · {recruiter.workplace?.name ?? "No workplace"}
            </Text>
          </View>
          <StatusBadge status={recruiter.employment_status ?? "pending"} />
        </View>

        {/* Toggle Details Button */}
        <TouchableOpacity
          onPress={() => setShowDetails(!showDetails)}
          style={[styles.toggleBtn, { backgroundColor: c.navy }]}
        >
          <Feather name={showDetails ? "chevron-up" : "chevron-down"} size={16} color={c.white} />
          <Text style={[styles.toggleText, { color: c.white, fontFamily: "Inter_600SemiBold" }]}>
            {showDetails ? "Hide Details" : "View Details"}
          </Text>
        </TouchableOpacity>

        {/* Collapsible Detail Sections */}
        {showDetails && (
          <View>
            {/* Actions - inside details */}
            <View style={styles.actionsContainer}>
              <TouchableOpacity
                onPress={() => router.push({ pathname: "/(admin)/recruiters/edit", params: { id: recruiter.id } } as any)}
                style={[styles.actionBtn, { backgroundColor: c.teal }]}
              >
                <Feather name="edit-2" size={16} color={c.white} />
                <Text style={[styles.actionText, { color: c.white, fontFamily: "Inter_600SemiBold" }]}>Edit Recruiter</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setShowDeactivateConfirm(true)}
                style={[styles.actionBtn, { backgroundColor: recruiter.employment_status === "active" ? c.destructive : c.success }]}
              >
                <Feather name={recruiter.employment_status === "active" ? "trash-2" : "check-circle"} size={16} color={c.white} />
                <Text style={[styles.actionText, { color: c.white, fontFamily: "Inter_600SemiBold" }]}>
                  {recruiter.employment_status === "active" ? "Deactivate" : "Activate"}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Activate/Deactivate confirmation */}
            {showDeactivateConfirm && (
              <View style={[styles.section, { backgroundColor: c.white, marginBottom: 12 }]}>
                <Text style={[styles.sectionTitle, { color: c.navy, fontFamily: "Poppins_700Bold" }]}>
                  {recruiter.employment_status === "active" ? "Confirm Deactivation" : "Confirm Activation"}
                </Text>
                <Text style={{ color: c.text, fontFamily: "Inter_400Regular", fontSize: 14, marginBottom: 12 }}>
                  Are you sure you want to {recruiter.employment_status === "active" ? "deactivate" : "activate"} {recruiter.full_name}?
                </Text>
                <View style={{ flexDirection: "row", gap: 12 }}>
                  <TouchableOpacity
                    onPress={() => setShowDeactivateConfirm(false)}
                    style={[styles.actionBtn, { flex: 1, backgroundColor: c.muted }]}
                  >
                    <Text style={[styles.actionText, { color: c.mutedForeground, fontFamily: "Inter_600SemiBold" }]}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleToggleStatus}
                    style={[styles.actionBtn, { flex: 1, backgroundColor: recruiter.employment_status === "active" ? c.destructive : c.success }]}
                  >
                    <Text style={[styles.actionText, { color: c.white, fontFamily: "Inter_600SemiBold" }]}>
                      {recruiter.employment_status === "active" ? "Deactivate" : "Activate"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {SECTIONS.map((section) => (
              <View key={section.title} style={[styles.section, { backgroundColor: c.white }]}>
                <Text style={[styles.sectionTitle, { color: c.navy, fontFamily: "Poppins_700Bold" }]}>{section.title}</Text>
                {section.rows.map(([label, val]) => <InfoRow key={label} label={label ?? ""} value={val} />)}
              </View>
            ))}
          </View>
        )}

        {/* Stats Overview */}
        <View style={[styles.section, { backgroundColor: c.white }]}>
          <Text style={[styles.sectionTitle, { color: c.navy, fontFamily: "Poppins_700Bold" }]}>Today's Overview</Text>
          <View style={styles.statsRow}>
            {[
              { icon: "users", label: "Team", value: stats.total_employees, color: c.navy },
              { icon: "log-in", label: "Signed In", value: stats.signed_in_today, color: c.success },
              { icon: "x-circle", label: "Absent", value: stats.not_signed_in, color: c.destructive },
              { icon: "alert-triangle", label: "Overdue", value: stats.shift_overdue_count, color: c.warning },
            ].map((stat) => (
              <View key={stat.label} style={[styles.stat, { backgroundColor: c.background }]}>
                <Feather name={stat.icon as any} size={18} color={stat.color} />
                <Text style={[styles.statValue, { color: stat.color, fontFamily: "Poppins_700Bold" }]}>{stat.value}</Text>
                <Text style={[styles.statLabel, { color: c.mutedForeground, fontFamily: "Inter_400Regular" }]}>{stat.label}</Text>
              </View>
            ))}
          </View>
          <View style={[styles.monthStats, { borderTopColor: c.border }]}>
            <View style={styles.monthStat}>
              <Feather name="file-text" size={14} color={c.warning} />
              <Text style={[styles.monthStatText, { color: c.text, fontFamily: "Inter_500Medium" }]}>
                Absences this month: <Text style={{ color: c.warning, fontFamily: "Poppins_700Bold" }}>{stats.absence_notes_this_month}</Text>
              </Text>
            </View>
            <View style={styles.monthStat}>
              <Feather name="shuffle" size={14} color={c.teal} />
              <Text style={[styles.monthStatText, { color: c.text, fontFamily: "Inter_500Medium" }]}>
                Reassignments this month: <Text style={{ color: c.teal, fontFamily: "Poppins_700Bold" }}>{stats.reassignments_this_month}</Text>
              </Text>
            </View>
          </View>
        </View>

        {/* Employee List with Status */}
        <View style={[styles.section, { backgroundColor: c.white }]}>
          <Text style={[styles.sectionTitle, { color: c.navy, fontFamily: "Poppins_700Bold" }]}>
            Team ({employees.length})
          </Text>
          {employees.length === 0 ? (
            <Text style={{ color: c.mutedForeground, fontStyle: "italic" }}>No employees assigned</Text>
          ) : (
            employees.map((item) => {
              const status = getStatus(item);
              const emp = item.employee;
              const shiftDisplay = emp.shift_start_time && emp.shift_end_time
                ? `${emp.shift_start_time} - ${emp.shift_end_time}`
                : null;

              return (
                <TouchableOpacity
                  key={emp.id}
                  style={[styles.empRow, { borderBottomColor: c.border }]}
                  onPress={() => router.push(`/(admin)/employees/${emp.id}`)}
                >
                  <View style={[styles.empAvatar, { backgroundColor: c.muted }]}>
                    <Text style={[styles.empAvatarText, { color: c.navy, fontFamily: "Poppins_700Bold" }]}>
                      {emp.full_name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.empName, { color: c.text, fontFamily: "Inter_600SemiBold" }]}>{emp.full_name}</Text>
                    <Text style={[styles.empSub, { color: c.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                      {emp.designation ?? "—"} · {emp.workplace?.name ?? "—"}
                    </Text>
                    {shiftDisplay && (
                      <Text style={[styles.shiftText, { color: c.teal, fontFamily: "Inter_500Medium" }]}>
                        <Feather name="clock" size={10} color={c.teal} /> {shiftDisplay}
                      </Text>
                    )}
                    {(item.login_time || item.signoff_time) && (
                      <View style={{ marginTop: 2 }}>
                        {item.login_time && (
                          <Text style={[styles.timeText, { color: c.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                            <Feather name="log-in" size={10} color={c.success} /> {new Date(item.login_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} {item.login_address ? `· ${item.login_address}` : ""}
                          </Text>
                        )}
                        {item.signoff_time && (
                          <Text style={[styles.timeText, { color: c.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                            <Feather name="log-out" size={10} color={c.destructive} /> {new Date(item.signoff_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </Text>
                        )}
                      </View>
                    )}
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 4 }}>
                    <StatusBadge status={status} />
                    {item.shift_overdue && !item.logged_in && item.has_shift_today && (
                      <View style={[styles.overdueBadge, { backgroundColor: "#FEF3C7" }]}>
                        <Feather name="alert-triangle" size={10} color={c.warning} />
                        <Text style={[styles.overdueText, { color: c.warning, fontFamily: "Inter_600SemiBold" }]}>Overdue</Text>
                      </View>
                    )}
                    {item.has_absence_note && (
                      <View style={[styles.absenceBadge, { backgroundColor: "#DBEAFE" }]}>
                        <Feather name="file-text" size={10} color={c.teal} />
                        <Text style={[styles.absenceText, { color: c.teal, fontFamily: "Inter_600SemiBold" }]}>Absent</Text>
                      </View>
                    )}
                  </View>
                  <Feather name="chevron-right" size={16} color={c.mutedForeground} />
                </TouchableOpacity>
              );
            })
          )}
        </View>
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
  section: { borderRadius: 10, padding: 16, marginBottom: 12, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  sectionTitle: { fontSize: 14, marginBottom: 10 },
  infoRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: "#F3F4F6" },
  infoLabel: { fontSize: 13, flex: 1 },
  infoValue: { fontSize: 13, flex: 2, textAlign: "right" },
  actionsContainer: { flexDirection: "row", gap: 12, marginBottom: 12 },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, borderRadius: 8 },
  actionText: { fontSize: 14 },
  statsRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  stat: { flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: 8, gap: 2 },
  statValue: { fontSize: 18 },
  statLabel: { fontSize: 10 },
  monthStats: { borderTopWidth: 1, paddingTop: 10, gap: 6 },
  monthStat: { flexDirection: "row", alignItems: "center", gap: 8 },
  monthStatText: { fontSize: 13 },
  empRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, borderBottomWidth: 1 },
  empAvatar: { width: 40, height: 40, borderRadius: 20, justifyContent: "center", alignItems: "center" },
  empAvatarText: { fontSize: 16 },
  empName: { fontSize: 14 },
  empSub: { fontSize: 11, marginTop: 1 },
  shiftText: { fontSize: 10, marginTop: 2 },
  timeText: { fontSize: 10, marginTop: 1 },
  overdueBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  overdueText: { fontSize: 9 },
  absenceBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  absenceText: { fontSize: 9 },
  toggleBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12, borderRadius: 8, marginBottom: 12 },
  toggleText: { fontSize: 14 },
});