import { Ionicons } from "@expo/vector-icons";
import axios, { isAxiosError } from "axios";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform, SafeAreaView,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { BASE_URL } from "../constants/api";

type Role = "parent" | "driver";
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const getErrorMessage = (error: unknown) => {
  if (isAxiosError(error)) {
    return error.response?.data?.message ||
      (error.code === "ECONNABORTED"
        ? "The request timed out. Please try again."
        : "Unable to connect to Trackefy. Check your internet connection.");
  }
  return "Something went wrong. Please try again.";
};

export default function RegisterScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ role?: string }>();
  const initialRole: Role = params.role === "driver" ? "driver" : "parent";
  const [role, setRole] = useState<Role>(initialRole);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [verifiedEmail, setVerifiedEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [accountCode, setAccountCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otpTimer, setOtpTimer] = useState(0);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    if (otpTimer <= 0) return;
    const timer = setInterval(() => setOtpTimer((value) => value - 1), 1000);
    return () => clearInterval(timer);
  }, [otpTimer]);

  const normalizedEmail = useMemo(() => email.trim().toLowerCase(), [email]);

  const changeRole = (nextRole: Role) => {
    if (nextRole === role) return;
    setRole(nextRole);
    setAccountCode("");
  };

  const changeEmail = (value: string) => {
    const nextEmail = value.trim().toLowerCase();
    if (otpSent && nextEmail !== verifiedEmail) {
      setOtpSent(false);
      setOtp("");
      setOtpTimer(0);
      setVerifiedEmail("");
    }
    setEmail(value);
  };

  const sendOtp = async () => {
    if (isSendingOtp || otpTimer > 0) return;
    if (!normalizedEmail) {
      Alert.alert("Email required", "Please enter your email address first.");
      return;
    }
    if (!emailPattern.test(normalizedEmail)) {
      Alert.alert("Invalid email", "Please enter a valid email address.");
      return;
    }

    setIsSendingOtp(true);
    try {
      await axios.post(`${BASE_URL}/auth/send-otp`, { email: normalizedEmail }, { timeout: 10000 });
      setOtpSent(true);
      setVerifiedEmail(normalizedEmail);
      setOtp("");
      setOtpTimer(60);
      Alert.alert("Verification code sent", "Check your email for the 6-digit code. It is valid for 1 minute.");
    } catch (error) {
      Alert.alert("Could not send code", getErrorMessage(error));
    } finally {
      setIsSendingOtp(false);
    }
  };

  const validate = () => {
    if (!fullName.trim()) return "Please enter your full name.";
    if (role === "parent" && !/^\d{10}$/.test(phone)) return "Please enter a valid 10-digit phone number.";
    if (!emailPattern.test(normalizedEmail)) return "Please enter a valid email address.";
    if (!otpSent || verifiedEmail !== normalizedEmail) return "Please request an email verification code first.";
    if (!/^\d{6}$/.test(otp)) return "Please enter the 6-digit verification code.";
    if (!password) return "Please create a password.";
    if (password !== confirmPassword) return "The passwords do not match.";
    if (!accountCode.trim()) {
      return role === "parent"
        ? "Please enter the Student Code provided by your school."
        : "Please enter the School Code provided by your school.";
    }
    return null;
  };

  const createAccount = async () => {
    const validationError = validate();
    if (validationError) {
      Alert.alert("Check your details", validationError);
      return;
    }

    const normalizedCode = accountCode.trim().toUpperCase();
    const payload = role === "parent"
      ? { fullName: fullName.trim(), phone, email: normalizedEmail, password, otp, studentCode: normalizedCode, children: [] }
      : { fullName: fullName.trim(), email: normalizedEmail, password, otp, driverCode: normalizedCode };

    setIsCreating(true);
    try {
      const response = await axios.post(`${BASE_URL}/${role}/signup`, payload, { timeout: 12000 });
      Alert.alert(
        "Account created",
        response.data?.message || "Your Trackefy account is ready. You can now sign in.",
        [{ text: "Sign in", onPress: () => router.back() }]
      );
    } catch (error) {
      Alert.alert("Account creation failed", getErrorMessage(error));
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={22} color="#1E293B" />
          </TouchableOpacity>

          <View style={styles.header}>
            <View style={styles.iconCircle}><Ionicons name="bus" size={30} color="#2563EB" /></View>
            <Text style={styles.title}>Create your account</Text>
            <Text style={styles.subtitle}>Join Trackefy to stay connected throughout every school trip.</Text>
          </View>

          <View style={styles.roleSelector}>
            {(["parent", "driver"] as Role[]).map((item) => (
              <TouchableOpacity key={item} style={[styles.roleTab, role === item && styles.activeRoleTab]} onPress={() => changeRole(item)}>
                <Ionicons name={item === "parent" ? "people" : "car"} size={18} color={role === item ? "#FFFFFF" : "#64748B"} />
                <Text style={[styles.roleText, role === item && styles.activeRoleText]}>{item === "parent" ? "Parent" : "Driver"}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.card}>
            <Field
              label={role === "parent" ? "Parent’s full name" : "Driver’s full name"}
              icon="person-outline" value={fullName} onChangeText={setFullName}
              placeholder="Enter your full name" autoCapitalize="words"
            />

            {role === "parent" && (
              <Field label="Phone number" icon="call-outline" value={phone}
                onChangeText={(value) => setPhone(value.replace(/\D/g, "").slice(0, 10))}
                placeholder="Enter your 10-digit phone number" keyboardType="phone-pad" maxLength={10}
              />
            )}

            <Text style={styles.label}>Email address</Text>
            <View style={styles.otpRow}>
              <View style={styles.emailInputWrap}>
                <Ionicons name="mail-outline" size={20} color="#94A3B8" />
                <TextInput style={styles.inlineInput} value={email} onChangeText={changeEmail}
                  placeholder="Enter your email" placeholderTextColor="#94A3B8" keyboardType="email-address"
                  autoCapitalize="none" autoCorrect={false} editable={!isCreating}
                />
              </View>
              <TouchableOpacity style={[styles.otpButton, (isSendingOtp || otpTimer > 0) && styles.disabledButton]}
                disabled={isSendingOtp || otpTimer > 0 || isCreating} onPress={sendOtp}
              >
                {isSendingOtp ? <ActivityIndicator size="small" color="#FFFFFF" /> : (
                  <Text style={styles.otpButtonText}>{otpTimer > 0 ? `${otpTimer}s` : otpSent ? "Resend" : "Send OTP"}</Text>
                )}
              </TouchableOpacity>
            </View>

            {otpSent && (
              <Field label="Verification code" icon="shield-checkmark-outline" value={otp}
                onChangeText={(value) => setOtp(value.replace(/\D/g, "").slice(0, 6))}
                placeholder="Enter the 6-digit OTP" keyboardType="number-pad" maxLength={6}
              />
            )}

            <PasswordField label="Password" value={password} onChangeText={setPassword}
              visible={showPassword} onToggle={() => setShowPassword((value) => !value)} placeholder="Create a strong password" />
            <PasswordField label="Confirm password" value={confirmPassword} onChangeText={setConfirmPassword}
              visible={showConfirmPassword} onToggle={() => setShowConfirmPassword((value) => !value)} placeholder="Re-enter your password" />

            <Field label={role === "parent" ? "Student Code" : "School Code"} icon="key-outline"
              value={accountCode} onChangeText={(value) => setAccountCode(value.toUpperCase())}
              placeholder={role === "parent" ? "Enter the code provided for your child" : "Enter the code shared by your school"}
              autoCapitalize="characters" autoCorrect={false}
            />
            <Text style={styles.helpText}>Ask your school administrator if you have not received this code.</Text>

            <TouchableOpacity style={[styles.createButton, isCreating && styles.disabledButton]} onPress={createAccount} disabled={isCreating}>
              {isCreating ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.createButtonText}>Create Account</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={styles.signInLink} onPress={() => router.back()}>
              <Text style={styles.signInText}>Already have an account? <Text style={styles.signInAccent}>Sign in</Text></Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

type FieldProps = {
  label: string; icon: keyof typeof Ionicons.glyphMap; value: string;
  onChangeText: (value: string) => void; placeholder: string;
  keyboardType?: "default" | "email-address" | "number-pad" | "phone-pad";
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  autoCorrect?: boolean; maxLength?: number;
};

function Field({ label, icon, ...inputProps }: FieldProps) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputWrap}>
        <Ionicons name={icon} size={20} color="#94A3B8" />
        <TextInput {...inputProps} style={styles.inlineInput} placeholderTextColor="#94A3B8" />
      </View>
    </View>
  );
}

type PasswordFieldProps = {
  label: string; value: string; onChangeText: (value: string) => void;
  visible: boolean; onToggle: () => void; placeholder: string;
};

function PasswordField({ label, value, onChangeText, visible, onToggle, placeholder }: PasswordFieldProps) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputWrap}>
        <Ionicons name="lock-closed-outline" size={20} color="#94A3B8" />
        <TextInput style={styles.inlineInput} value={value} onChangeText={onChangeText}
          placeholder={placeholder} placeholderTextColor="#94A3B8" secureTextEntry={!visible} autoCapitalize="none" />
        <TouchableOpacity onPress={onToggle} hitSlop={10}>
          <Ionicons name={visible ? "eye-off-outline" : "eye-outline"} size={21} color="#64748B" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 }, safeArea: { flex: 1, backgroundColor: "#F5F7FB" },
  content: { padding: 20, paddingTop: 18, paddingBottom: 42 },
  backButton: { width: 42, height: 42, borderRadius: 14, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#E2E8F0" },
  header: { alignItems: "center", marginTop: 12, marginBottom: 22 },
  iconCircle: { width: 58, height: 58, borderRadius: 20, backgroundColor: "#DBEAFE", alignItems: "center", justifyContent: "center", marginBottom: 12 },
  title: { fontSize: 29, fontWeight: "900", color: "#0F172A", textAlign: "center" },
  subtitle: { fontSize: 15, lineHeight: 22, color: "#64748B", textAlign: "center", marginTop: 7, paddingHorizontal: 12 },
  roleSelector: { flexDirection: "row", backgroundColor: "#E9EEF9", padding: 5, borderRadius: 16, marginBottom: 14 },
  roleTab: { flex: 1, flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center", paddingVertical: 12, borderRadius: 12 },
  activeRoleTab: { backgroundColor: "#2563EB" }, roleText: { color: "#64748B", fontSize: 15, fontWeight: "700" }, activeRoleText: { color: "#FFFFFF" },
  card: { backgroundColor: "#FFFFFF", borderRadius: 24, padding: 20, borderWidth: 1, borderColor: "#E8EDF5", shadowColor: "#0F172A", shadowOpacity: 0.06, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 3 },
  fieldGroup: { marginBottom: 16 }, label: { fontSize: 14, fontWeight: "700", color: "#334155", marginBottom: 8 },
  inputWrap: { minHeight: 54, flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderColor: "#DCE3EE", borderRadius: 14, paddingHorizontal: 14, backgroundColor: "#FFFFFF" },
  inlineInput: { flex: 1, minHeight: 52, fontSize: 15, color: "#0F172A" },
  otpRow: { flexDirection: "row", gap: 9, marginBottom: 16 },
  emailInputWrap: { flex: 1, minHeight: 54, flexDirection: "row", alignItems: "center", gap: 9, borderWidth: 1, borderColor: "#DCE3EE", borderRadius: 14, paddingHorizontal: 13, backgroundColor: "#FFFFFF" },
  otpButton: { minWidth: 92, minHeight: 54, borderRadius: 14, paddingHorizontal: 12, backgroundColor: "#2563EB", alignItems: "center", justifyContent: "center" },
  otpButtonText: { color: "#FFFFFF", fontSize: 13, fontWeight: "800" },
  helpText: { marginTop: -8, marginBottom: 19, fontSize: 12, lineHeight: 18, color: "#64748B" },
  createButton: { minHeight: 56, borderRadius: 16, backgroundColor: "#2563EB", alignItems: "center", justifyContent: "center", shadowColor: "#2563EB", shadowOpacity: 0.22, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 3 },
  createButtonText: { color: "#FFFFFF", fontSize: 17, fontWeight: "800" }, disabledButton: { opacity: 0.55 },
  signInLink: { paddingVertical: 17, alignItems: "center" }, signInText: { color: "#64748B", fontSize: 14 }, signInAccent: { color: "#2563EB", fontWeight: "800" },
});
