import { Stack, useRouter } from "expo-router";
import { useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import { useAuth } from "@/context/AuthContext";

export default function RecruiterLayout() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.replace("/(auth)/login");
    } else if (user.role !== "recruiter") {
      if (user.role === "admin") router.replace("/(admin)/dashboard");
      else router.replace("/(employee)/dashboard");
    }
  }, [user, isLoading, router]);

  if (isLoading || !user || user.role !== "recruiter") {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#fff" }}>
        <ActivityIndicator size="large" color="#003B5C" />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="dashboard" />
      <Stack.Screen name="employees/index" />
      <Stack.Screen name="employees/add" />
      <Stack.Screen name="employees/[id]" />
      <Stack.Screen name="employees/edit" />
      <Stack.Screen name="shifts" />
      <Stack.Screen name="attendance" />
      <Stack.Screen name="leaves" />
      <Stack.Screen name="absence-note" />
      <Stack.Screen name="reassign" />
      <Stack.Screen name="qr-settings" />
      <Stack.Screen name="import" />
      <Stack.Screen name="export" />
      <Stack.Screen name="notifications" />
    </Stack>
  );
}
