import "../firebase";
import { Stack } from "expo-router";

export default function Layout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="parent" />
      <Stack.Screen name="driver" />
    </Stack>
  );
}