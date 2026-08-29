import { Ionicons } from "@expo/vector-icons";
import axios, { isAxiosError } from "axios";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { BASE_URL } from "../constants/api";

type Role = "parent" | "driver";
const message = (e: unknown) => isAxiosError(e) ? e.response?.data?.message || "Unable to connect to Trackefy." : "Something went wrong.";

export default function ForgotPassword() {
  const router = useRouter();
  const params = useLocalSearchParams<{ role?: string }>();
  const [role, setRole] = useState<Role>(params.role === "driver" ? "driver" : "parent");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [sent, setSent] = useState(false);
  const [timer, setTimer] = useState(0);
  const [loading, setLoading] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (timer <= 0) return;
    const id = setInterval(() => setTimer((v) => v - 1), 1000);
    return () => clearInterval(id);
  }, [timer]);

  const normalizedEmail = email.trim().toLowerCase();
  const sendCode = async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) return Alert.alert("Invalid email", "Enter a valid email address.");
    setLoading(true);
    try {
      const res = await axios.post(`${BASE_URL}/password/forgot-password`, { email: normalizedEmail, role }, { timeout: 10000 });
      setSent(true); setTimer(60); setOtp("");
      Alert.alert("Check your email", res.data?.message || "If an account exists, a reset code has been sent.");
    } catch (e) { Alert.alert("Unable to send code", message(e)); }
    finally { setLoading(false); }
  };

  const reset = async () => {
    if (!/^\d{6}$/.test(otp)) return Alert.alert("Invalid code", "Enter the 6-digit reset code.");
    if (password.length < 8) return Alert.alert("Password too short", "Use at least 8 characters.");
    if (password !== confirm) return Alert.alert("Passwords do not match", "Enter the same password twice.");
    setLoading(true);
    try {
      const res = await axios.post(`${BASE_URL}/password/reset-password`, { email: normalizedEmail, role, otp, newPassword: password }, { timeout: 10000 });
      Alert.alert("Password reset", res.data?.message || "You can now sign in.", [{ text: "Sign in", onPress: () => router.back() }]);
    } catch (e) { Alert.alert("Reset failed", message(e)); }
    finally { setLoading(false); }
  };

  return <SafeAreaView style={s.safe}><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
    <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
      <TouchableOpacity style={s.back} onPress={() => router.back()}><Ionicons name="arrow-back" size={22} color="#1E293B" /></TouchableOpacity>
      <View style={s.icon}><Ionicons name="key" size={29} color="#2563EB" /></View>
      <Text style={s.title}>Reset your password</Text><Text style={s.sub}>We’ll send a secure code to your registered email.</Text>
      <View style={s.tabs}>{(["parent", "driver"] as Role[]).map((r) => <TouchableOpacity key={r} style={[s.tab, role === r && s.active]} onPress={() => { setRole(r); setSent(false); setOtp(""); }}><Text style={[s.tabText, role === r && s.activeText]}>{r === "parent" ? "Parent" : "Driver"}</Text></TouchableOpacity>)}</View>
      <View style={s.card}>
        <Text style={s.label}>Email address</Text><TextInput style={s.input} value={email} onChangeText={(v) => { setEmail(v); setSent(false); }} autoCapitalize="none" keyboardType="email-address" placeholder="Enter your registered email" />
        {sent && <><Text style={s.label}>Reset code</Text><TextInput style={s.input} value={otp} onChangeText={(v) => setOtp(v.replace(/\D/g, "").slice(0, 6))} keyboardType="number-pad" placeholder="6-digit code" />
        <Text style={s.label}>New password</Text><View style={s.password}><TextInput style={s.passwordInput} value={password} onChangeText={setPassword} secureTextEntry={!visible} placeholder="At least 8 characters" /><TouchableOpacity onPress={() => setVisible(!visible)}><Ionicons name={visible ? "eye-off" : "eye"} size={21} color="#64748B" /></TouchableOpacity></View>
        <Text style={s.label}>Confirm new password</Text><TextInput style={s.input} value={confirm} onChangeText={setConfirm} secureTextEntry={!visible} placeholder="Re-enter new password" /></>}
        <TouchableOpacity style={[s.primary, loading && s.disabled]} disabled={loading} onPress={sent ? reset : sendCode}>{loading ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryText}>{sent ? "Reset Password" : "Send Reset Code"}</Text>}</TouchableOpacity>
        {sent && <TouchableOpacity disabled={timer > 0 || loading} onPress={sendCode}><Text style={s.resend}>{timer > 0 ? `Resend in ${timer}s` : "Resend code"}</Text></TouchableOpacity>}
      </View>
    </ScrollView></KeyboardAvoidingView></SafeAreaView>;
}

const s = StyleSheet.create({ safe:{flex:1,backgroundColor:"#F5F7FB"},page:{padding:22,paddingBottom:40},back:{width:42,height:42,borderRadius:14,backgroundColor:"#fff",alignItems:"center",justifyContent:"center"},icon:{width:60,height:60,borderRadius:20,backgroundColor:"#DBEAFE",alignSelf:"center",alignItems:"center",justifyContent:"center",marginTop:16},title:{fontSize:28,fontWeight:"900",color:"#0F172A",textAlign:"center",marginTop:14},sub:{fontSize:15,color:"#64748B",textAlign:"center",marginTop:7,marginBottom:20},tabs:{flexDirection:"row",backgroundColor:"#E9EEF9",padding:5,borderRadius:15,marginBottom:14},tab:{flex:1,padding:12,alignItems:"center",borderRadius:11},active:{backgroundColor:"#2563EB"},tabText:{fontWeight:"700",color:"#64748B"},activeText:{color:"#fff"},card:{backgroundColor:"#fff",padding:20,borderRadius:22},label:{fontSize:14,fontWeight:"700",color:"#334155",marginBottom:8,marginTop:5},input:{height:54,borderWidth:1,borderColor:"#DCE3EE",borderRadius:14,paddingHorizontal:14,fontSize:15,marginBottom:15,color:"#0F172A"},password:{height:54,borderWidth:1,borderColor:"#DCE3EE",borderRadius:14,paddingHorizontal:14,flexDirection:"row",alignItems:"center",marginBottom:15},passwordInput:{flex:1,fontSize:15,color:"#0F172A"},primary:{height:56,borderRadius:16,backgroundColor:"#2563EB",alignItems:"center",justifyContent:"center",marginTop:5},primaryText:{color:"#fff",fontWeight:"800",fontSize:16},disabled:{opacity:.55},resend:{textAlign:"center",color:"#2563EB",fontWeight:"700",paddingTop:17} });
