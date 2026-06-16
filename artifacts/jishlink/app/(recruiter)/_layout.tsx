import { Stack } from "expo-router";

export default function RecruiterLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="dashboard" />
      <Stack.Screen name="absence-note" />
      <Stack.Screen name="reassign" />
      <Stack.Screen name="notifications" />
    </Stack>
  );
}
