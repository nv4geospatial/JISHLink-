import { Stack } from "expo-router";

export default function AdminLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="dashboard" />
      <Stack.Screen name="employees/index" />
      <Stack.Screen name="employees/add" />
      <Stack.Screen name="employees/[id]" />
      <Stack.Screen name="import" />
      <Stack.Screen name="review-queue" />
      <Stack.Screen name="qr-settings" />
      <Stack.Screen name="recruiter-oversight" />
      <Stack.Screen name="notifications" />
    </Stack>
  );
}
