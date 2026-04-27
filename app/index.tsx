import { View, Text, TextInput, TouchableOpacity, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useState } from "react";
import axios from "axios";
import { BASE_URL } from "../constants/api";
import AsyncStorage from "@react-native-async-storage/async-storage";

export default function Login() {
  const router = useRouter();

  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState("parent");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleLogin = async () => {
    try {
      const url =
        role === "parent"
          ? `${BASE_URL}/api/parent/login`
          : `${BASE_URL}/api/driver/login`;

      const res = await axios.post(
        url,
        { email, password },
        { timeout: 8000 } // 🔥 prevent delay
      );

      await AsyncStorage.setItem("token", res.data.token);

      if (role === "parent") router.replace("/parent");
      else router.replace("/driver");
    } catch (err: any) {
      if (err.response) alert(err.response.data?.message || "Login failed");
      else alert("Server not responding");
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Trackefy 🚍</Text>

      <TextInput
        placeholder="Email"
        style={styles.input}
        value={email}
        onChangeText={setEmail}
      />

      {/* ✅ PASSWORD WITH EYE */}
      <View style={styles.passwordBox}>
        <TextInput
          placeholder="Password"
          style={{ flex: 1, padding: 10 }}
          secureTextEntry={!showPassword}
          value={password}
          onChangeText={setPassword}
        />
        <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
          <Text style={{ padding: 10 }}>
            {showPassword ? "🙈" : "👁️"}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.roleContainer}>
        <TouchableOpacity onPress={() => setRole("parent")}>
          <Text style={role === "parent" ? styles.active : styles.inactive}>
            Parent
          </Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => setRole("driver")}>
          <Text style={role === "driver" ? styles.active : styles.inactive}>
            Driver
          </Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.button} onPress={handleLogin}>
        <Text style={styles.buttonText}>Sign In</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => router.push("/register" as any)}>
        <Text style={{ marginTop: 15 }}>Create Account</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 20, backgroundColor: "#fff" },
  title: { fontSize: 28, textAlign: "center", marginBottom: 20 },

  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    padding: 10,
    marginBottom: 10,
    borderRadius: 6,
  },

  passwordBox: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 6,
    marginBottom: 10,
  },

  button: {
    backgroundColor: "#2563eb",
    padding: 12,
    borderRadius: 6,
    marginTop: 10,
  },

  buttonText: { color: "#fff", textAlign: "center" },

  roleContainer: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginVertical: 10,
  },

  active: { color: "blue", fontWeight: "bold" },
  inactive: { color: "gray" },
});