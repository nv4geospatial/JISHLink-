import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image,
} from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Toast from "react-native-toast-message";
import { useAuth } from "@/context/AuthContext";
import colors from "@/constants/colors";
import { apiFetch } from "@/lib/api";

export default function LoginScreen() {
  const { login, user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const c = colors.light;

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) {
      Toast.show({ type: "error", text1: "Please enter username and password" });
      return;
    }
    setLoading(true);
    try {
      const result = await login(username.trim(), password);
      if (!result.passwordChanged) {
        router.replace("/(auth)/change-password");
        return;
      }
      // Navigation handled by RootLayoutNav
    } catch (e: unknown) {
      Toast.show({ type: "error", text1: "Login failed", text2: e instanceof Error ? e.message : "Invalid credentials" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: c.navy }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 40), paddingBottom: insets.bottom + 32 },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          {/* Logo */}
          <View style={styles.logoContainer}>
            <Image
              source={require("@/assets/images/logo.jpeg")}
              style={styles.logo}
              resizeMode="contain"
            />
          </View>

          <Text style={[styles.brand, { color: c.gold, fontFamily: "Poppins_700Bold" }]}>
            JISHLink
          </Text>
          <Text style={[styles.tagline, { color: "#FFFFFF99", fontFamily: "Inter_400Regular" }]}>
            Workforce Management System
          </Text>

          {/* Card */}
          <View style={[styles.card, { backgroundColor: c.white, borderRadius: c.radius * 1.5 }]}>
            <Text style={[styles.cardTitle, { color: c.navy, fontFamily: "Poppins_700Bold" }]}>
              Sign In
            </Text>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: c.mutedForeground, fontFamily: "Inter_500Medium" }]}>
                Username
              </Text>
              <View style={[styles.inputWrap, { borderColor: c.border, backgroundColor: c.offwhite }]}>
                <Feather name="user" size={18} color={c.mutedForeground} style={{ marginRight: 10 }} />
                <TextInput
                  style={[styles.input, { color: c.text, fontFamily: "Inter_400Regular" }]}
                  value={username}
                  onChangeText={setUsername}
                  placeholder="Enter your username"
                  placeholderTextColor={c.mutedForeground}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: c.mutedForeground, fontFamily: "Inter_500Medium" }]}>
                Password
              </Text>
              <View style={[styles.inputWrap, { borderColor: c.border, backgroundColor: c.offwhite }]}>
                <Feather name="lock" size={18} color={c.mutedForeground} style={{ marginRight: 10 }} />
                <TextInput
                  style={[styles.input, { color: c.text, fontFamily: "Inter_400Regular", flex: 1 }]}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Enter your password"
                  placeholderTextColor={c.mutedForeground}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                />
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Feather name={showPassword ? "eye-off" : "eye"} size={18} color={c.mutedForeground} />
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.loginBtn, { backgroundColor: c.gold, opacity: loading ? 0.7 : 1 }]}
              onPress={handleLogin}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color={c.navy} />
              ) : (
                <Text style={[styles.loginBtnText, { color: c.navy, fontFamily: "Poppins_700Bold" }]}>
                  Login
                </Text>
              )}
            </TouchableOpacity>
          </View>

          <Text style={[styles.footer, { color: "#FFFFFF66", fontFamily: "Inter_400Regular" }]}>
            JISHLink Consulting India Private Limited
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flexGrow: 1, alignItems: "center", paddingHorizontal: 24 },
  logoContainer: { marginBottom: 16 },
  logo: { width: 100, height: 100 },
  brand: { fontSize: 32, marginBottom: 4 },
  tagline: { fontSize: 14, marginBottom: 40 },
  card: {
    width: "100%",
    maxWidth: 420,
    padding: 28,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
    marginBottom: 32,
  },
  cardTitle: { fontSize: 22, marginBottom: 24 },
  inputGroup: { marginBottom: 16 },
  label: { fontSize: 13, marginBottom: 6 },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  input: { flex: 1, fontSize: 15 },
  loginBtn: {
    paddingVertical: 15,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 8,
  },
  loginBtnText: { fontSize: 16 },
  footer: { fontSize: 12, textAlign: "center" },
});
