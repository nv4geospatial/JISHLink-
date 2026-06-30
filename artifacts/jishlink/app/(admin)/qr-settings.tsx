import React, { useState, useCallback } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Platform, Share as RNShare,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import QRCode from "react-native-qrcode-svg";
import Toast from "react-native-toast-message";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system";
import { NavHeader } from "@/components/NavHeader";
import colors from "@/constants/colors";

const DEFAULT_URL = "https://docs.google.com/forms/d/e/1FAIpQLSc192PE19STVaivDDi6jEGKCa6_O6jrW0gxtR4oV5wSc3_OFw/viewform?usp=publish-editor";

export default function QRSettingsScreen() {
  const insets = useSafeAreaInsets();
  const c = colors.light;
  const [url, setUrl] = useState(DEFAULT_URL);
  const [saved, setSaved] = useState(DEFAULT_URL);
  const [qrCodeObj, setQrCodeObj] = useState<any>(null);

  const handleSave = () => {
    if (!url.trim()) { Toast.show({ type: "error", text1: "Enter a URL" }); return; }
    setSaved(url.trim());
    Toast.show({ type: "success", text1: "QR code generated!" });
  };

  const handleShareLink = async () => {
    if (!saved) return;
    
    // Web: use Web Share API or clipboard fallback
    if (Platform.OS === "web") {
      if (typeof navigator !== "undefined" && navigator.share) {
        try {
          await navigator.share({ title: "Registration Link", url: saved });
        } catch { /* user cancelled */ }
      } else {
        await navigator.clipboard.writeText(saved);
        Toast.show({ type: "success", text1: "Link copied to clipboard!" });
      }
      return;
    }
    
    // Native: use React Native Share (works with URLs on mobile)
    try {
      await RNShare.share({ message: saved, url: saved });
    } catch {
      // user cancelled — ignore
    }
  };

  const handleShareQRImage = async () => {
    if (!saved) {
      Toast.show({ type: "error", text1: "Generate QR first" });
      return;
    }
    
    // Web: convert SVG to canvas and share as image
    if (Platform.OS === "web") {
      try {
        const svgElement = document.querySelector("svg");
        if (!svgElement) {
          Toast.show({ type: "error", text1: "QR not found" });
          return;
        }
        const svgData = new XMLSerializer().serializeToString(svgElement);
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        const img = new Image();
        img.onload = async () => {
          canvas.width = img.width;
          canvas.height = img.height;
          ctx?.drawImage(img, 0, 0);
          canvas.toBlob(async (blob) => {
            if (!blob) return;
            const file = new File([blob], "qr-code.png", { type: "image/png" });
            if (typeof navigator !== "undefined" && navigator.share) {
              try {
                await navigator.share({ files: [file], title: "QR Code" });
              } catch { /* user cancelled */ }
            } else {
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = "qr-code.png";
              a.click();
              URL.revokeObjectURL(url);
              Toast.show({ type: "success", text1: "QR image downloaded!" });
            }
          });
        };
        img.src = "data:image/svg+xml;base64," + btoa(svgData);
      } catch {
        Toast.show({ type: "error", text1: "Failed to share QR image" });
      }
      return;
    }
    
    // Native: use react-native-qrcode-svg toDataURL with callback
    if (!qrCodeObj) {
      Toast.show({ type: "error", text1: "Generate QR first" });
      return;
    }
    
    try {
      // toDataURL in v6.3.x uses callback: toDataURL(callback, padding)
      const dataUrl = await new Promise<string | null>((resolve) => {
        qrCodeObj.toDataURL((url: string) => resolve(url), 500);
      });
      
      if (!dataUrl) {
        Toast.show({ type: "error", text1: "Could not generate QR image" });
        return;
      }
      
      const base64 = dataUrl.replace(/^data:image\/png;base64,/, "");
      const fileUri = (FileSystem.cacheDirectory ?? "") + "qr-code.png";
      
      await FileSystem.writeAsStringAsync(fileUri, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });
      
      // Verify file exists before sharing
      const fileInfo = await FileSystem.getInfoAsync(fileUri);
      if (!fileInfo.exists) {
        throw new Error("File not created");
      }
      
      await Sharing.shareAsync(fileUri, {
        dialogTitle: "Share QR Code",
        mimeType: "image/png",
        UTI: "public.png",
      });
    } catch (err: any) {
      console.error("QR share error:", err);
      Toast.show({ type: "error", text1: "Failed to share QR: " + (err?.message || "Unknown error") });
    }
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
          <View style={styles.inputRow}>
            <TextInput
              style={[styles.inputWithBtn, { borderColor: c.border, backgroundColor: c.offwhite, color: c.text, fontFamily: "Inter_400Regular" }]}
              value={url}
              onChangeText={setUrl}
              placeholder="https://docs.google.com/forms/..."
              placeholderTextColor={c.mutedForeground}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity onPress={handleShareLink} style={[styles.shareLinkBtn, { backgroundColor: c.gold }]} activeOpacity={0.7}>
              <Feather name="share-2" size={14} color={c.navy} />
              <Text style={[styles.shareLinkText, { color: c.navy, fontFamily: "Poppins_600SemiBold" }]}>Share</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity onPress={handleSave} style={[styles.btn, { backgroundColor: c.gold }]}>
            <Text style={[styles.btnText, { color: c.navy, fontFamily: "Poppins_700Bold" }]}>Generate QR</Text>
          </TouchableOpacity>
        </View>

        {saved ? (
          <View style={[styles.qrContainer, { backgroundColor: c.white }]}>
            <QRCode
              getRef={(ref: any) => setQrCodeObj(ref)}
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

  inputRow: { flexDirection: "row", gap: 8, alignItems: "center", marginBottom: 14 },
  inputWithBtn: { flex: 1, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  shareLinkBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8 },
  shareLinkText: { fontSize: 13 },
});
