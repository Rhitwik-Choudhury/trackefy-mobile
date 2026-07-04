import { View, Text, TextInput, TouchableOpacity, StyleSheet, Image } from "react-native";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import axios from "axios";
import { BASE_URL } from "../constants/api";
import AsyncStorage from "@react-native-async-storage/async-storage";

export default function Login() {
  const router = useRouter();

  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState("parent");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  useEffect(() => {
    const checkLogin = async () => {
      const token = await AsyncStorage.getItem("token");
      const savedRole = await AsyncStorage.getItem("role");

      if (token && savedRole === "parent") {
        router.replace("/parent");
      }

      if (token && savedRole === "driver") {
        router.replace("/driver");
      }
    };

    checkLogin();
  }, []);

  const handleLogin = async () => {
    try {

      const url =
        role === "parent"
          ? `${BASE_URL}/parent/login`
          : `${BASE_URL}/driver/login`;

      const res = await axios.post(
        url,
        { email, password },
        { timeout: 8000 } // 🔥 prevent delay
      );

      await AsyncStorage.setItem("token", res.data.token);
      await AsyncStorage.setItem("role", role);
      if (role === "parent") {
        await AsyncStorage.setItem("parentData", JSON.stringify(res.data.parent));
      }

      if (role === "parent") {
        setTimeout(() => router.replace("/parent"), 100);
      } else {
        setTimeout(() => router.replace("/driver"), 100);
      }
    } catch (err: any) {
      console.log("LOGIN ERROR:", err.response?.data || err.message);
      if (err.response) {
        console.log("BACKEND ERROR:", err.response.data);
        alert(err.response.data?.message || "Login failed");
      } else {
        console.log("NETWORK ERROR:", err.message);
        alert("Server not responding");
      }
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.loginCard}>
        {/* LOGO */}
        <View style={styles.logoCircle}>
          <Image
            source={require("../assets/logo.jpeg")}
            style={styles.logoBus}
            resizeMode="cover"
          />
        </View>

        <Text style={styles.title}>Trackefy</Text>
        <Text style={styles.subtitle}>
          Track your child’s school bus in real time
        </Text>

        {/* EMAIL */}
        <TextInput
          placeholder="📧  Email"
          placeholderTextColor="#9ca3af"
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />

        {/* PASSWORD */}
        <View style={styles.passwordBox}>
          <TextInput
            placeholder="🔒  Password"
            placeholderTextColor="#9ca3af"
            style={styles.passwordInput}
            secureTextEntry={!showPassword}
            value={password}
            onChangeText={setPassword}
          />
          <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
            <Text style={styles.eyeText}>
              {showPassword ? "🙈" : "👁️"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* ROLE SELECTOR */}
        <View style={styles.roleContainer}>
          <TouchableOpacity
            style={[
              styles.roleTab,
              role === "parent" && styles.activeRoleTab,
            ]}
            onPress={() => setRole("parent")}
          >
            <Text
              style={[
                styles.roleText,
                role === "parent" && styles.activeRoleText,
              ]}
            >
              Parent
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.roleTab,
              role === "driver" && styles.activeRoleTab,
            ]}
            onPress={() => setRole("driver")}
          >
            <Text
              style={[
                styles.roleText,
                role === "driver" && styles.activeRoleText,
              ]}
            >
              Driver
            </Text>
          </TouchableOpacity>
        </View>

        {/* SIGN IN */}
        <TouchableOpacity style={styles.button} onPress={handleLogin}>
          <Text style={styles.buttonText}>Sign In</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.push("/register" as any)}>
          <Text style={styles.createText}>Create Account</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    padding: 22,
    backgroundColor: "#F8FAFC",
  },

  loginCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 28,
    padding: 24,
    elevation: 5,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },

  logoCircle: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: "#DBEAFE",
    alignSelf: "center",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 18,
    overflow: "hidden",
  },

  logoBus: {
    width: 110,
    height: 110,
    borderRadius: 55,
  },

  title: {
    fontSize: 42,
    fontWeight: "900",
    color: "#111827",
    textAlign: "center",
    letterSpacing: 0.5,
  },

  subtitle: {
    fontSize: 15,
    color: "#6B7280",
    textAlign: "center",
    marginTop: 6,
    marginBottom: 28,
    fontWeight: "500",
  },

  input: {
    height: 58,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 16,
    marginBottom: 14,
    borderRadius: 16,
    fontSize: 16,
    color: "#111827",
  },

  passwordBox: {
    height: 58,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    marginBottom: 18,
  },

  passwordInput: {
    flex: 1,
    paddingHorizontal: 16,
    color: "#111827",
    fontSize: 16,
  },

  eyeText: {
    paddingHorizontal: 16,
    fontSize: 18,
  },

  roleContainer: {
    flexDirection: "row",
    backgroundColor: "#EEF2FF",
    borderRadius: 16,
    padding: 5,
    marginBottom: 18,
  },

  roleTab: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
  },

  activeRoleTab: {
    backgroundColor: "#2563EB",
  },

  roleText: {
    color: "#6B7280",
    fontWeight: "700",
    fontSize: 15,
  },

  activeRoleText: {
    color: "#FFFFFF",
  },

  button: {
    backgroundColor: "#2563EB",
    paddingVertical: 16,
    borderRadius: 16,
    marginTop: 4,
    elevation: 2,
  },

  buttonText: {
    color: "#FFFFFF",
    textAlign: "center",
    fontSize: 17,
    fontWeight: "800",
  },

  createText: {
    marginTop: 18,
    textAlign: "center",
    color: "#2563EB",
    fontWeight: "700",
    fontSize: 15,
  },
});