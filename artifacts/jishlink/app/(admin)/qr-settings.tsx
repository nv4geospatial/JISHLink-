import React, { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Platform,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import QRCode from "react-native-qrcode-svg";
import Toast from "react-native-toast-message";
import { NavHeader } from "@/components/NavHeader";
import colors from "@/constants/colors";

const DEFAULT_URL = "https://docs.google.com/forms/d/e/1FAIpQLSc192PE19STVaivDDi6jEGKCa6_O6jrW0gxtR4oV5wSc3_OFw/viewform?usp=publish-editor";

export default function QRSettingsScreen() {
  const insets = useSafeAreaInsets();
  const c = colors.light;
  const [url, setUrl] = useState(DEFAULT_URL);
  const [saved, setSaved] = useState(DEFAULT_URL);

  const handleSave = () => {
    if (!url.trim()) { Toast.show({ type: "error", text1: "Enter a URL" }); return; }
    setSaved(url.trim());
    Toast.show({ type: "success", text1: "QR code generated!" });
  };

  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <NavHeader title="QR Settings" showBack />
      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: bottomPad + 32, alignItems: "center" }}>
        <View style={[styles.card, { backgroundColor: c.white }]}>
          <Text style={[styles.title, { color: c.navy, fontFamily: "Poppins_700Bold" }]}>Google Form QR Code</Text>
          <Text style={[styles.subtitle, { color: c.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            Paste your Google Form URL below to generate a QR code for candidate registration.
          </Text>

          <Text style={[styles.label, { color: c.mutedForeground, fontFamily: "Inter_500Medium" }]}>Form URL</Text>
          <TextInput
            style={[styles.input, { borderColor: c.border, backgroundColor: c.offwhite, color: c.text, fontFamily: "Inter_400Regular" }]}
            value={url}
            onChangeText={setUrl}
            placeholder="https://docs.google.com/forms/..."
            placeholderTextColor={c.mutedForeground}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity onPress={handleSave} style={[styles.btn, { backgroundColor: c.gold }]}>
            <Text style={[styles.btnText, { color: c.navy, fontFamily: "Poppins_700Bold" }]}>Generate QR</Text>
          </TouchableOpacity>
        </View>

        {saved ? (
          <View style={[styles.qrContainer, { backgroundColor: c.white }]}>
            <QRCode
              value={saved}
              size={220}
              color={c.navy}
              backgroundColor={c.white}
            />
            <Text style={[styles.qrLabel, { color: c.navy, fontFamily: "Poppins_700Bold" }]}>Scan to Register</Text>
            <Text style={[styles.qrSub, { color: c.mutedForeground, fontFamily: "Inter_400Regular" }]} numberOfLines={2}>
              {saved}
            </Text>

            <View style={[styles.infoBox, { backgroundColor: c.muted, borderRadius: 8 }]}>
              <Feather name="info" size={16} color={c.teal} />
              <Text style={[styles.infoText, { color: c.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                Share this QR code with candidates. When they fill the form, submissions appear in the Review Queue for approval.
              </Text>
            </View>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  card: { width: "100%", maxWidth: 420, borderRadius: 12, padding: 20, marginBottom: 16, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  title: { fontSize: 18, marginBottom: 6 },
  subtitle: { fontSize: 14, marginBottom: 16 },
  label: { fontSize: 13, marginBottom: 4 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, marginBottom: 14 },
  btn: { paddingVertical: 13, borderRadius: 8, alignItems: "center" },
  btnText: { fontSize: 15 },
  qrContainer: { width: "100%", maxWidth: 420, borderRadius: 12, padding: 24, alignItems: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2, gap: 12 },
  qrLabel: { fontSize: 18, marginTop: 4 },
  qrSub: { fontSize: 11, textAlign: "center", color: "#9CA3AF" },
  infoBox: { flexDirection: "row", gap: 10, padding: 12, marginTop: 4 },
  infoText: { flex: 1, fontSize: 12 },
});
