import React, { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Platform, Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Toast from "react-native-toast-message";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { NavHeader } from "@/components/NavHeader";
import { EmptyState } from "@/components/EmptyState";
import colors from "@/constants/colors";

interface ShiftTemplate {
  id: string; name: string; start_time: string; end_time: string; days: string;
}

interface Employee {
  id: string; full_name: string; designation?: string | null;
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function ShiftManagementScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const c = colors.light;
  const qc = useQueryClient();

  const [templateName, setTemplateName] = useState("");
  const [startTime, setStartTime] = useState("09:00 AM");
  const [endTime, setEndTime] = useState("06:00 PM");
  const [selectedDays, setSelectedDays] = useState<string[]>(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
  const [assignStartDate, setAssignStartDate] = useState("");
  const [assignEndDate, setAssignEndDate] = useState("");
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"templates" | "assign">("templates");

  const { data: templates } = useQuery<ShiftTemplate[]>({
    queryKey: ["shift-templates"],
    queryFn: () => apiFetch("/shifts/templates"),
  });

  const { data: employees } = useQuery<Employee[]>({
    queryKey: ["recruiter-employees"],
    queryFn: () => apiFetch("/employees"),
  });

  const toggleDay = (day: string) => {
    setSelectedDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]);
  };

  const toggleEmployee = (id: string) => {
    setSelectedEmployees(prev => prev.includes(id) ? prev.filter(e => e !== id) : [...prev, id]);
  };

  const selectAllEmployees = () => {
    if (selectedEmployees.length === (employees ?? []).length) {
      setSelectedEmployees([]);
    } else {
      setSelectedEmployees((employees ?? []).map(e => e.id));
    }
  };

  const createTemplate = async () => {
    if (!templateName || !startTime || !endTime) {
      Toast.show({ type: "error", text1: "Name, start time and end time are required" });
      return;
    }
    setLoading(true);
    try {
      await apiFetch("/shifts/templates", {
        method: "POST",
        body: JSON.stringify({
          name: templateName,
          start_time: startTime,
          end_time: endTime,
          days: selectedDays.join(","),
        }),
      });
      Toast.show({ type: "success", text1: "Shift template created!" });
      qc.invalidateQueries({ queryKey: ["shift-templates"] });
      setTemplateName("");
      setStartTime("09:00 AM");
      setEndTime("06:00 PM");
      setSelectedDays(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
    } catch (e: unknown) {
      Toast.show({ type: "error", text1: "Failed", text2: e instanceof Error ? e.message : "Error" });
    } finally {
      setLoading(false);
    }
  };

  const assignShift = async () => {
    if (!selectedTemplate || selectedEmployees.length === 0 || !assignStartDate || !assignEndDate) {
      Toast.show({ type: "error", text1: "Select template, employees, and date range" });
      return;
    }
    
    // Validate dates
    const start = new Date(assignStartDate);
    const end = new Date(assignEndDate);
    if (start > end) {
      Toast.show({ type: "error", text1: "End date must be after start date" });
      return;
    }
    
    setLoading(true);
    try {
      await apiFetch("/shifts/assign", {
        method: "POST",
        body: JSON.stringify({
          employee_ids: selectedEmployees,
          template_id: selectedTemplate,
          start_date: assignStartDate,
          end_date: assignEndDate,
        }),
      });
      Toast.show({ type: "success", text1: `Shift assigned to ${selectedEmployees.length} employees!` });
      setSelectedEmployees([]);
      setSelectedTemplate("");
      setAssignStartDate("");
      setAssignEndDate("");
      setActiveTab("templates");
    } catch (e: unknown) {
      Toast.show({ type: "error", text1: "Failed", text2: e instanceof Error ? e.message : "Error" });
    } finally {
      setLoading(false);
    }
  };

  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <NavHeader title="Shift Management" showBack />

      {/* Tabs */}
      <View style={styles.tabRow}>
        <TouchableOpacity
          onPress={() => setActiveTab("templates")}
          style={[styles.tab, { backgroundColor: activeTab === "templates" ? c.navy : c.muted }]}
        >
          <Text style={[styles.tabText, { color: activeTab === "templates" ? c.white : c.mutedForeground }]}>Templates</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setActiveTab("assign")}
          style={[styles.tab, { backgroundColor: activeTab === "assign" ? c.navy : c.muted }]}
        >
          <Text style={[styles.tabText, { color: activeTab === "assign" ? c.white : c.mutedForeground }]}>Assign Shifts</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: bottomPad + 32 }}>
        {activeTab === "templates" ? (
          <>
            {/* Create Template */}
            <View style={[styles.section, { backgroundColor: c.white }]}>
              <Text style={[styles.sectionTitle, { color: c.navy, fontFamily: "Poppins_700Bold" }]}>Create Shift Template</Text>
              
              <Text style={[styles.label, { color: c.mutedForeground }]}>Template Name *</Text>
              <TextInput
                style={[styles.input, { borderColor: c.border, backgroundColor: c.offwhite, color: c.text }]}
                value={templateName}
                onChangeText={setTemplateName}
                placeholder="e.g., Morning Shift"
                placeholderTextColor={c.mutedForeground}
              />

              <View style={styles.shiftRow}>
                <View style={styles.shiftField}>
                  <Text style={[styles.label, { color: c.mutedForeground }]}>Start Time *</Text>
                  <TextInput
                    style={[styles.input, { borderColor: c.border, backgroundColor: c.offwhite, color: c.text }]}
                    value={startTime}
                    onChangeText={setStartTime}
                    placeholder="09:00 AM"
                  />
                </View>
                <View style={styles.shiftField}>
                  <Text style={[styles.label, { color: c.mutedForeground }]}>End Time *</Text>
                  <TextInput
                    style={[styles.input, { borderColor: c.border, backgroundColor: c.offwhite, color: c.text }]}
                    value={endTime}
                    onChangeText={setEndTime}
                    placeholder="06:00 PM"
                  />
                </View>
              </View>

              <Text style={[styles.label, { color: c.mutedForeground, marginTop: 12 }]}>Working Days</Text>
              <View style={styles.pillRow}>
                {DAYS.map((day) => (
                  <TouchableOpacity
                    key={day}
                    onPress={() => toggleDay(day)}
                    style={[styles.dayPill, { 
                      backgroundColor: selectedDays.includes(day) ? c.navy : c.muted,
                      borderColor: selectedDays.includes(day) ? c.navy : c.border
                    }]}
                  >
                    <Text style={{ color: selectedDays.includes(day) ? c.white : c.mutedForeground, fontFamily: "Inter_500Medium" }}>{day}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity onPress={createTemplate} style={[styles.saveBtn, { backgroundColor: c.gold, marginTop: 16 }]} disabled={loading}>
                {loading ? <ActivityIndicator color={c.navy} /> : <Text style={[styles.saveBtnText, { color: c.navy, fontFamily: "Poppins_700Bold" }]}>Create Template</Text>}
              </TouchableOpacity>
            </View>

            {/* Existing Templates */}
            <View style={[styles.section, { backgroundColor: c.white }]}>
              <Text style={[styles.sectionTitle, { color: c.navy, fontFamily: "Poppins_700Bold" }]}>Your Templates ({(templates ?? []).length})</Text>
              {(templates ?? []).length === 0 && <EmptyState icon="clock" title="No templates yet" />}
              {(templates ?? []).map((t) => (
                <TouchableOpacity
                  key={t.id}
                  onPress={() => { setSelectedTemplate(t.id); setActiveTab("assign"); }}
                  style={[styles.templateCard, { backgroundColor: c.offwhite }]}
                >
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <Text style={{ color: c.text, fontFamily: "Inter_600SemiBold", fontSize: 15 }}>{t.name}</Text>
                    <Feather name="arrow-right" size={16} color={c.teal} />
                  </View>
                  <Text style={{ color: c.mutedForeground, fontSize: 13, marginTop: 4 }}>
                    {t.start_time} - {t.end_time} | {t.days}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        ) : (
          <>
            {/* Assign Shift */}
            <View style={[styles.section, { backgroundColor: c.white }]}>
              <Text style={[styles.sectionTitle, { color: c.navy, fontFamily: "Poppins_700Bold" }]}>Assign Shift to Employees</Text>
              
              {/* Selected Template Display */}
              {selectedTemplate && (
                <View style={[styles.selectedTemplate, { backgroundColor: c.navy }]}>
                  <Text style={{ color: c.white, fontFamily: "Inter_600SemiBold" }}>
                    {templates?.find(t => t.id === selectedTemplate)?.name ?? "Selected Template"}
                  </Text>
                  <Text style={{ color: c.gold, fontSize: 12 }}>
                    {templates?.find(t => t.id === selectedTemplate)?.start_time} - {templates?.find(t => t.id === selectedTemplate)?.end_time}
                  </Text>
                  <TouchableOpacity onPress={() => setSelectedTemplate("")} style={{ position: "absolute", top: 8, right: 8 }}>
                    <Feather name="x" size={16} color={c.white} />
                  </TouchableOpacity>
                </View>
              )}

              {!selectedTemplate && (
                <TouchableOpacity onPress={() => setActiveTab("templates")} style={[styles.selectTemplateBtn, { borderColor: c.border }]}>
                  <Feather name="plus" size={16} color={c.navy} />
                  <Text style={{ color: c.navy, fontFamily: "Inter_500Medium" }}>Select a Template First</Text>
                </TouchableOpacity>
              )}

              {/* Date Range */}
              <View style={styles.dateRow}>
                <View style={styles.dateField}>
                  <Text style={[styles.label, { color: c.mutedForeground }]}>From Date *</Text>
                  <TextInput
                    style={[styles.input, { borderColor: c.border, backgroundColor: c.offwhite, color: c.text }]}
                    value={assignStartDate}
                    onChangeText={setAssignStartDate}
                    placeholder="YYYY-MM-DD"
                  />
                </View>
                <View style={styles.dateField}>
                  <Text style={[styles.label, { color: c.mutedForeground }]}>To Date *</Text>
                  <TextInput
                    style={[styles.input, { borderColor: c.border, backgroundColor: c.offwhite, color: c.text }]}
                    value={assignEndDate}
                    onChangeText={setAssignEndDate}
                    placeholder="YYYY-MM-DD"
                  />
                </View>
              </View>

              {/* Employee Selection */}
              <View style={styles.employeeSection}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <Text style={[styles.label, { color: c.mutedForeground }]}>Select Employees</Text>
                  <TouchableOpacity onPress={selectAllEmployees}>
                    <Text style={{ color: c.teal, fontFamily: "Inter_600SemiBold", fontSize: 12 }}>
                      {selectedEmployees.length === (employees ?? []).length ? "Deselect All" : "Select All"}
                    </Text>
                  </TouchableOpacity>
                </View>
                
                {(employees ?? []).map((emp) => (
                  <TouchableOpacity
                    key={emp.id}
                    onPress={() => toggleEmployee(emp.id)}
                    style={[styles.empChip, { 
                      backgroundColor: selectedEmployees.includes(emp.id) ? c.teal : c.muted,
                      borderColor: selectedEmployees.includes(emp.id) ? c.teal : c.border
                    }]}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <View style={[styles.empAvatar, { backgroundColor: selectedEmployees.includes(emp.id) ? c.white : c.navy }]}>
                        <Text style={{ color: selectedEmployees.includes(emp.id) ? c.teal : c.white, fontSize: 12, fontFamily: "Poppins_700Bold" }}>
                          {emp.full_name.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <View>
                        <Text style={{ color: selectedEmployees.includes(emp.id) ? c.white : c.text, fontFamily: "Inter_500Medium" }}>
                          {emp.full_name}
                        </Text>
                        <Text style={{ color: selectedEmployees.includes(emp.id) ? c.white : c.mutedForeground, fontSize: 11 }}>
                          {emp.designation ?? "—"}
                        </Text>
                      </View>
                    </View>
                    {selectedEmployees.includes(emp.id) && (
                      <Feather name="check-circle" size={18} color={c.white} />
                    )}
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity 
                onPress={assignShift} 
                style={[styles.saveBtn, { backgroundColor: c.gold, marginTop: 16 }]} 
                disabled={loading || !selectedTemplate || selectedEmployees.length === 0 || !assignStartDate || !assignEndDate}
              >
                {loading ? <ActivityIndicator color={c.navy} /> : (
                  <Text style={[styles.saveBtnText, { color: c.navy, fontFamily: "Poppins_700Bold" }]}>
                    Assign to {selectedEmployees.length} Employee{selectedEmployees.length !== 1 ? "s" : ""}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  tabRow: { flexDirection: "row", padding: 16, gap: 8 },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: "center" },
  tabText: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  section: { borderRadius: 10, padding: 16, marginBottom: 12, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  sectionTitle: { fontSize: 15, marginBottom: 12 },
  label: { fontSize: 12, marginBottom: 4, fontFamily: "Inter_500Medium" },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, fontFamily: "Inter_400Regular" },
  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  dayPill: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, minWidth: 44, alignItems: "center", borderWidth: 1 },
  shiftRow: { flexDirection: "row", gap: 12 },
  shiftField: { flex: 1 },
  saveBtn: { borderRadius: 8, alignItems: "center", paddingVertical: 13 },
  saveBtnText: { fontSize: 15 },
  templateCard: { padding: 12, borderRadius: 8, marginBottom: 8 },
  selectedTemplate: { padding: 12, borderRadius: 8, marginBottom: 16, position: "relative" },
  selectTemplateBtn: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: 8, borderWidth: 1, borderStyle: "dashed", marginBottom: 16 },
  dateRow: { flexDirection: "row", gap: 12, marginBottom: 16 },
  dateField: { flex: 1 },
  employeeSection: { marginTop: 8 },
  empChip: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 10, borderRadius: 8, marginBottom: 6, borderWidth: 1 },
  empAvatar: { width: 28, height: 28, borderRadius: 14, justifyContent: "center", alignItems: "center" },
});