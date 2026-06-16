import React, { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, ScrollView, Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Toast from "react-native-toast-message";
import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/lib/api";
import colors from "@/constants/colors";

export default function ChangePasswordScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const c = colors.light;
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext] = useState(false);

  const handleChange = async () => {
    if (!current || !next || !confirm) {
      Toast.show({ type: "error", text1: "Fill all fields" }); return;
    }
    if (next !== confirm) {
      Toast.show({ type: "error", text1: "Passwords do not match" }); return;
    }
    if (next.length < 6) {
      Toast.show({ type: "error", text1: "Password must be at least 6 characters" }); return;
    }
    setLoading(true);
    try {
      await apiFetch("/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      Toast.show({ type: "success", text1: "Password updated!" });
      const role = user?.role ?? "employee";
      if (role === "admin") router.replace("/(admin)/dashboard");
      else if (role === "recruiter") router.replace("/(recruiter)/dashboard");
      else router.replace("/(employee)/dashboard");
    } catch (e: unknown) {
      Toast.show({ type: "error", text1: "Failed", text2: e instanceof Error ? e.message : "Error" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: c.navy }]}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 60), paddingBottom: insets.bottom + 32 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <Feather name="shield" size={48} color={c.gold} style={{ marginBottom: 16 }} />
        <Text style={[styles.title, { color: c.white, fontFamily: "Poppins_700Bold" }]}>
          Set Your Password
        </Text>
        <Text style={[styles.subtitle, { color: "#FFFFFF99", fontFamily: "Inter_400Regular" }]}>
          First login requires a password change
        </Text>

        <View style={[styles.card, { backgroundColor: c.white, borderRadius: c.radius * 1.5 }]}>
          {[
            { label: "Current Password", val: current, set: setCurrent, show: showCurrent, toggle: setShowCurrent },
            { label: "New Password", val: next, set: setNext, show: showNext, toggle: setShowNext },
            { label: "Confirm Password", val: confirm, set: setConfirm, show: showNext, toggle: () => {} },
          ].map((f, i) => (
            <View key={i} style={{ marginBottom: 16 }}>
              <Text style={[styles.label, { color: c.mutedForeground, fontFamily: "Inter_500Medium" }]}>{f.label}</Text>
              <View style={[styles.inputWrap, { borderColor: c.border, backgroundColor: c.offwhite }]}>
                <TextInput
                  style={[styles.input, { color: c.text, fontFamily: "Inter_400Regular", flex: 1 }]}
                  value={f.val}
                  onChangeText={f.set}
                  secureTextEntry={!f.show}
                  placeholder={f.label}
                  placeholderTextColor={c.mutedForeground}
                  autoCapitalize="none"
                />
                {i < 2 && (
                  <TouchableOpacity onPress={() => f.toggle(!f.show)}>
                    <Feather name={f.show ? "eye-off" : "eye"} size={18} color={c.mutedForeground} />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          ))}

          <TouchableOpacity
            style={[styles.btn, { backgroundColor: c.gold, opacity: loading ? 0.7 : 1 }]}
            onPress={handleChange}
            disabled={loading}
          >
            {loading ? <ActivityIndicator color={c.navy} /> : (
              <Text style={[styles.btnText, { color: c.navy, fontFamily: "Poppins_700Bold" }]}>Update Password</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flexGrow: 1, alignItems: "center", paddingHorizontal: 24 },
  title: { fontSize: 26, marginBottom: 8 },
  subtitle: { fontSize: 14, marginBottom: 32, textAlign: "center" },
  card: { width: "100%", maxWidth: 420, padding: 24, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 16, elevation: 8 },
  label: { fontSize: 13, marginBottom: 6 },
  inputWrap: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12 },
  input: { fontSize: 15 },
  btn: { paddingVertical: 15, borderRadius: 8, alignItems: "center", marginTop: 8 },
  btnText: { fontSize: 16 },
});
