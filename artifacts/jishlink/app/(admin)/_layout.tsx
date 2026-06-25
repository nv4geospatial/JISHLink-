import { Stack, useRouter } from "expo-router";
import { useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import { useAuth } from "@/context/AuthContext";

export default function AdminLayout() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.replace("/(auth)/login");
    } else if (user.role !== "admin") {
      if (user.role === "recruiter") router.replace("/(recruiter)/dashboard");
      else router.replace("/(employee)/dashboard");
    }
  }, [user, isLoading, router]);

  if (isLoading || !user || user.role !== "admin") {
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
      <Stack.Screen name="import" />
      <Stack.Screen name="import-employees" />
      <Stack.Screen name="import-recruiters" />
      <Stack.Screen name="export" />
      <Stack.Screen name="review-queue" />
      <Stack.Screen name="qr-settings" />
      <Stack.Screen name="recruiter-oversight" />
      <Stack.Screen name="recruiters/[id]" />
      <Stack.Screen name="recruiters/edit" />
      <Stack.Screen name="recruiters/add" />
      <Stack.Screen name="notifications" />
    </Stack>
  );
}
