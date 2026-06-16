import React, { useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, Platform, Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";
import Toast from "react-native-toast-message";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { NavHeader } from "@/components/NavHeader";
import { LoadingScreen } from "@/components/LoadingScreen";
import { reverseGeocode } from "@/lib/geocode";
import colors from "@/constants/colors";

interface TodayStatus {
  logged_in: boolean; signed_off: boolean;
  login_time?: string | null; signoff_time?: string | null; login_address?: string | null;
}
interface Notification { id: string; read: boolean; }

async function getLocationWeb(): Promise<{ latitude: number; longitude: number }> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
}

export default function EmployeeDashboard() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const c = colors.light;
  const qc = useQueryClient();
  const [attLoading, setAttLoading] = useState<"login" | "signoff" | null>(null);

  const { data: status, isLoading: statusLoading, refetch: refetchStatus } = useQuery<TodayStatus>({
    queryKey: ["today-status"],
    queryFn: () => apiFetch("/attendance/today-status"),
  });

  const { data: notifications } = useQuery<Notification[]>({
    queryKey: ["notifications"],
    queryFn: () => apiFetch("/notifications"),
  });

  const unread = (notifications ?? []).filter((n) => !n.read).length;

  const handleAttendance = async (type: "login" | "signoff") => {
    if (type === "login" && status?.logged_in) {
      Toast.show({ type: "info", text1: "Already logged in today" }); return;
    }
    if (type === "signoff" && status?.signed_off) {
      Toast.show({ type: "info", text1: "Already signed off today" }); return;
    }

    setAttLoading(type);
    try {
      let lat: number | undefined, lon: number | undefined, address: string | undefined;

      if (Platform.OS === "web") {
        try {
          const pos = await getLocationWeb();
          lat = pos.latitude; lon = pos.longitude;
          address = await reverseGeocode(lat, lon);
        } catch { /* location not available on web */ }
      } else {
        const [perm] = await Location.requestForegroundPermissionsAsync();
        if (perm.granted) {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
          lat = loc.coords.latitude; lon = loc.coords.longitude;
          address = await reverseGeocode(lat, lon);
        }
      }

      await apiFetch("/attendance", {
        method: "POST",
        body: JSON.stringify({ type, latitude: lat, longitude: lon, resolved_address: address }),
      });

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await refetchStatus();

      const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      Toast.show({
        type: "success",
        text1: type === "login" ? `Logged in at ${now}` : `Signed off at ${now}`,
        text2: address ?? undefined,
      });
    } catch (e: unknown) {
      Toast.show({ type: "error", text1: "Failed", text2: e instanceof Error ? e.message : "Error" });
    } finally {
      setAttLoading(null);
    }
  };

  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;
  const workplace = user?.workplace;

  if (statusLoading) return <LoadingScreen />;

  const loginDisabled = !!status?.logged_in || !!attLoading;
  const signoffDisabled = !!status?.signed_off || !status?.logged_in || !!attLoading;

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <NavHeader
        title="My Dashboard"
        rightIcon={<Feather name="bell" size={22} color={c.white} />}
        notificationCount={unread}
        onRightPress={() => router.push("/(employee)/notifications")}
      />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: bottomPad + 32 }}>
        {/* Greeting */}
        <View style={[styles.greetCard, { backgroundColor: c.navy }]}>
          <Text style={[styles.greeting, { color: c.gold, fontFamily: "Poppins_700Bold" }]}>
            Hello, {user?.full_name?.split(" ")[0]} 👋
          </Text>
          <Text style={[styles.designation, { color: "#FFFFFF99", fontFamily: "Inter_400Regular" }]}>
            {user?.designation ?? "Employee"}
          </Text>
        </View>

        {/* Workplace card */}
        <View style={[styles.workplaceCard, { backgroundColor: c.white }]}>
          <View style={styles.workplaceHeader}>
            <Feather name="map-pin" size={20} color={c.teal} />
            <Text style={[styles.workplaceTitle, { color: c.navy, fontFamily: "Poppins_700Bold" }]}>Your Workplace</Text>
          </View>
          {workplace ? (
            <>
              <Text style={[styles.workplaceName, { color: c.navy, fontFamily: "Inter_600SemiBold" }]}>{workplace.name}</Text>
              {workplace.client_name && <Text style={[styles.workplaceSub, { color: c.teal, fontFamily: "Inter_400Regular" }]}>{workplace.client_name}</Text>}
              {workplace.address && <Text style={[styles.workplaceAddr, { color: c.mutedForeground, fontFamily: "Inter_400Regular" }]}>{workplace.address}</Text>}
            </>
          ) : (
            <Text style={[styles.workplaceSub, { color: c.mutedForeground, fontFamily: "Inter_400Regular" }]}>No workplace assigned</Text>
          )}
        </View>

        {/* Today status */}
        {(status?.login_time || status?.signoff_time) && (
          <View style={[styles.statusCard, { backgroundColor: c.white }]}>
            <Text style={[styles.statusTitle, { color: c.navy, fontFamily: "Poppins_700Bold" }]}>Today</Text>
            {status?.login_time && (
              <View style={styles.statusRow}>
                <Feather name="log-in" size={16} color={c.success} />
                <Text style={[styles.statusText, { color: c.text, fontFamily: "Inter_400Regular" }]}>
                  Logged in at {new Date(status.login_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </Text>
              </View>
            )}
            {status?.login_address && (
              <Text style={[styles.addrText, { color: c.mutedForeground, fontFamily: "Inter_400Regular" }]} numberOfLines={2}>
                📍 {status.login_address}
              </Text>
            )}
            {status?.signoff_time && (
              <View style={styles.statusRow}>
                <Feather name="log-out" size={16} color={c.teal} />
                <Text style={[styles.statusText, { color: c.text, fontFamily: "Inter_400Regular" }]}>
                  Signed off at {new Date(status.signoff_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Attendance buttons */}
        <View style={styles.attButtons}>
          <TouchableOpacity
            onPress={() => handleAttendance("login")}
            disabled={loginDisabled}
            style={[styles.attBtn, {
              backgroundColor: loginDisabled ? c.muted : c.gold,
              opacity: loginDisabled ? 0.6 : 1,
            }]}
          >
            {attLoading === "login" ? <ActivityIndicator color={c.navy} /> : (
              <>
                <Feather name="log-in" size={24} color={c.navy} />
                <Text style={[styles.attBtnText, { color: c.navy, fontFamily: "Poppins_700Bold" }]}>LOG IN</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => handleAttendance("signoff")}
            disabled={signoffDisabled}
            style={[styles.attBtn, {
              backgroundColor: signoffDisabled ? c.muted : c.navy,
              opacity: signoffDisabled ? 0.6 : 1,
            }]}
          >
            {attLoading === "signoff" ? <ActivityIndicator color={c.white} /> : (
              <>
                <Feather name="log-out" size={24} color={signoffDisabled ? c.mutedForeground : c.white} />
                <Text style={[styles.attBtnText, { color: signoffDisabled ? c.mutedForeground : c.white, fontFamily: "Poppins_700Bold" }]}>SIGN OFF</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Quick links */}
        <View style={styles.quickLinks}>
          <TouchableOpacity
            onPress={() => router.push("/(employee)/attendance")}
            style={[styles.quickLink, { backgroundColor: c.white }]}
          >
            <Feather name="calendar" size={22} color={c.teal} />
            <Text style={[styles.quickLinkText, { color: c.navy, fontFamily: "Inter_600SemiBold" }]}>Attendance History</Text>
            <Feather name="chevron-right" size={16} color={c.mutedForeground} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={logout}
            style={[styles.quickLink, { backgroundColor: c.white }]}
          >
            <Feather name="log-out" size={22} color={c.destructive} />
            <Text style={[styles.quickLinkText, { color: c.destructive, fontFamily: "Inter_600SemiBold" }]}>Logout</Text>
            <Feather name="chevron-right" size={16} color={c.mutedForeground} />
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  greetCard: { borderRadius: 12, padding: 20, marginBottom: 12 },
  greeting: { fontSize: 22 },
  designation: { fontSize: 14, marginTop: 4 },
  workplaceCard: { borderRadius: 12, padding: 16, marginBottom: 12, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  workplaceHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  workplaceTitle: { fontSize: 14 },
  workplaceName: { fontSize: 18 },
  workplaceSub: { fontSize: 13, marginTop: 4 },
  workplaceAddr: { fontSize: 12, marginTop: 4 },
  statusCard: { borderRadius: 12, padding: 16, marginBottom: 12, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2, gap: 8 },
  statusTitle: { fontSize: 14 },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  statusText: { fontSize: 14 },
  addrText: { fontSize: 12, paddingLeft: 24 },
  attButtons: { flexDirection: "row", gap: 12, marginBottom: 16 },
  attBtn: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 22, borderRadius: 14, gap: 8, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 4 },
  attBtnText: { fontSize: 16 },
  quickLinks: { gap: 8 },
  quickLink: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderRadius: 10, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  quickLinkText: { flex: 1, fontSize: 15 },
});
