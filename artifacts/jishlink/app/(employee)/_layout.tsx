import { Stack, useRouter } from "expo-router";
import { useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import { useAuth } from "@/context/AuthContext";

export default function EmployeeLayout() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.replace("/(auth)/login");
    } else if (user.role !== "employee") {
      if (user.role === "admin") router.replace("/(admin)/dashboard");
      else router.replace("/(recruiter)/dashboard");
    }
  }, [user, isLoading, router]);

  if (isLoading || !user || user.role !== "employee") {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#fff" }}>
        <ActivityIndicator size="large" color="#003B5C" />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="dashboard" />
      <Stack.Screen name="attendance" />
      <Stack.Screen name="notifications" />
      <Stack.Screen name="scanner" />
      <Stack.Screen name="qr-settings" />
    </Stack>
  );
}
