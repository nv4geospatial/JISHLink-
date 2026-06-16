import React, { useState } from "react";
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Toast from "react-native-toast-message";
import { apiFetch } from "@/lib/api";
import { NavHeader } from "@/components/NavHeader";
import { LoadingScreen } from "@/components/LoadingScreen";
import colors from "@/constants/colors";

interface Employee { id: string; full_name: string; designation?: string | null; workplace?: { id: string; name: string } | null; }
interface Workplace { id: string; name: string; client_name?: string | null; }

export default function ReassignScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const c = colors.light;
  const qc = useQueryClient();
  const [selectedEmp, setSelectedEmp] = useState<Employee | null>(null);
  const [selectedWp, setSelectedWp] = useState<Workplace | null>(null);
  const [loading, setLoading] = useState(false);

  const { data: employees, isLoading: empLoading } = useQuery<Employee[]>({
    queryKey: ["my-employees"],
    queryFn: () => apiFetch("/employees"),
  });

  const { data: workplaces, isLoading: wpLoading } = useQuery<Workplace[]>({
    queryKey: ["workplaces"],
    queryFn: () => apiFetch("/workplaces"),
  });

  const handleReassign = async () => {
    if (!selectedEmp || !selectedWp) {
      Toast.show({ type: "error", text1: "Select an employee and workplace" }); return;
    }
    if (selectedEmp.workplace?.id === selectedWp.id) {
      Toast.show({ type: "info", text1: "Already assigned to this workplace" }); return;
    }
    setLoading(true);
    try {
      await apiFetch(`/employees/${selectedEmp.id}/reassign`, {
        method: "POST",
        body: JSON.stringify({ workplace_id: selectedWp.id }),
      });
      Toast.show({ type: "success", text1: `${selectedEmp.full_name} reassigned to ${selectedWp.name}` });
      qc.invalidateQueries({ queryKey: ["recruiter-dashboard"] });
      router.back();
    } catch (e: unknown) {
      Toast.show({ type: "error", text1: e instanceof Error ? e.message : "Failed" });
    } finally {
      setLoading(false);
    }
  };

  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  if (empLoading || wpLoading) return <LoadingScreen />;

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <NavHeader title="Reassign Workplace" showBack />
      <FlatList
        data={[]}
        renderItem={() => null}
        ListHeaderComponent={
          <View style={{ padding: 16, paddingBottom: bottomPad + 80 }}>
            <Text style={[styles.sectionTitle, { color: c.navy, fontFamily: "Poppins_700Bold" }]}>Select Employee</Text>
            {(employees ?? []).map((emp) => (
              <TouchableOpacity
                key={emp.id}
                onPress={() => setSelectedEmp(emp)}
                style={[styles.row, { backgroundColor: c.white, borderWidth: selectedEmp?.id === emp.id ? 2 : 0, borderColor: c.navy }]}
              >
                <View style={[styles.avatar, { backgroundColor: c.muted }]}>
                  <Text style={[styles.avatarText, { color: c.navy, fontFamily: "Poppins_700Bold" }]}>{emp.full_name.charAt(0).toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowName, { color: c.text, fontFamily: "Inter_600SemiBold" }]}>{emp.full_name}</Text>
                  <Text style={[styles.rowSub, { color: c.mutedForeground, fontFamily: "Inter_400Regular" }]}>{emp.workplace?.name ?? "No workplace"}</Text>
                </View>
                {selectedEmp?.id === emp.id && <Feather name="check-circle" size={20} color={c.navy} />}
              </TouchableOpacity>
            ))}

            <Text style={[styles.sectionTitle, { color: c.navy, fontFamily: "Poppins_700Bold", marginTop: 20 }]}>Select New Workplace</Text>
            {(workplaces ?? []).map((wp) => (
              <TouchableOpacity
                key={wp.id}
                onPress={() => setSelectedWp(wp)}
                style={[styles.row, { backgroundColor: c.white, borderWidth: selectedWp?.id === wp.id ? 2 : 0, borderColor: c.teal }]}
              >
                <Feather name="map-pin" size={20} color={c.teal} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowName, { color: c.text, fontFamily: "Inter_600SemiBold" }]}>{wp.name}</Text>
                  {wp.client_name && <Text style={[styles.rowSub, { color: c.mutedForeground, fontFamily: "Inter_400Regular" }]}>{wp.client_name}</Text>}
                </View>
                {selectedWp?.id === wp.id && <Feather name="check-circle" size={20} color={c.teal} />}
              </TouchableOpacity>
            ))}
          </View>
        }
      />

      <View style={[styles.bottomBar, { backgroundColor: c.white, paddingBottom: bottomPad + 8 }]}>
        <TouchableOpacity onPress={router.back} style={[styles.cancelBtn, { borderColor: c.border }]}>
          <Text style={[styles.cancelText, { color: c.mutedForeground, fontFamily: "Inter_500Medium" }]}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleReassign}
          style={[styles.saveBtn, { backgroundColor: selectedEmp && selectedWp ? c.gold : c.muted }]}
          disabled={!selectedEmp || !selectedWp || loading}
        >
          {loading ? <ActivityIndicator color={c.navy} /> : (
            <Text style={[styles.saveBtnText, { color: c.navy, fontFamily: "Poppins_700Bold" }]}>Confirm Reassign</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  sectionTitle: { fontSize: 15, marginBottom: 10 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 10, marginBottom: 8, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  avatar: { width: 40, height: 40, borderRadius: 20, justifyContent: "center", alignItems: "center" },
  avatarText: { fontSize: 18 },
  rowName: { fontSize: 15 },
  rowSub: { fontSize: 12, marginTop: 2 },
  bottomBar: { flexDirection: "row", gap: 12, paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: "#E5E7EB" },
  cancelBtn: { flex: 1, borderWidth: 1, borderRadius: 8, alignItems: "center", paddingVertical: 13 },
  cancelText: { fontSize: 15 },
  saveBtn: { flex: 2, borderRadius: 8, alignItems: "center", paddingVertical: 13 },
  saveBtnText: { fontSize: 15 },
});
