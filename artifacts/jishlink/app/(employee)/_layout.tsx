import { Stack } from "expo-router";

export default function EmployeeLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="dashboard" />
      <Stack.Screen name="attendance" />
      <Stack.Screen name="notifications" />
    </Stack>
  );
}
