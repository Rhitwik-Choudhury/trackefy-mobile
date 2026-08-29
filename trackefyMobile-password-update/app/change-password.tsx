import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import axios, { isAxiosError } from "axios";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, SafeAreaView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { BASE_URL } from "../constants/api";

const errorMessage = (e: unknown) => isAxiosError(e) ? e.response?.data?.message || "Unable to connect to Trackefy." : "Something went wrong.";

export default function ChangePassword() {
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!current) return Alert.alert("Current password required", "Enter your current password.");
    if (next.length < 8) return Alert.alert("Password too short", "Use at least 8 characters.");
    if (next !== confirm) return Alert.alert("Passwords do not match", "Enter the same new password twice.");
    if (current === next) return Alert.alert("Choose a new password", "Your new password must be different.");
    const token = await AsyncStorage.getItem("token");
    if (!token) return Alert.alert("Session expired", "Please sign in again.", [{ text: "Sign in", onPress: () => router.replace("/") }]);
    setLoading(true);
    try {
      const res = await axios.post(`${BASE_URL}/password/change-password`, { currentPassword: current, newPassword: next }, { headers: { Authorization: `Bearer ${token}` }, timeout: 10000 });
      Alert.alert("Password changed", res.data?.message || "Your password has been updated.", [{ text: "Done", onPress: () => router.back() }]);
    } catch (e) { Alert.alert("Unable to change password", errorMessage(e)); }
    finally { setLoading(false); }
  };

  return <SafeAreaView style={s.safe}><KeyboardAvoidingView style={s.page} behavior={Platform.OS === "ios" ? "padding" : undefined}>
    <TouchableOpacity style={s.back} onPress={() => router.back()}><Ionicons name="arrow-back" size={22} color="#1E293B" /></TouchableOpacity>
    <View style={s.icon}><Ionicons name="shield-checkmark" size={30} color="#2563EB" /></View>
    <Text style={s.title}>Change password</Text><Text style={s.sub}>Use a strong password you don’t use elsewhere.</Text>
    <View style={s.card}>
      <Field label="Current password" value={current} onChange={setCurrent} visible={visible} />
      <Field label="New password" value={next} onChange={setNext} visible={visible} hint="At least 8 characters" />
      <Field label="Confirm new password" value={confirm} onChange={setConfirm} visible={visible} />
      <TouchableOpacity style={s.show} onPress={() => setVisible(!visible)}><Ionicons name={visible ? "eye-off" : "eye"} size={20} color="#2563EB" /><Text style={s.showText}>{visible ? "Hide passwords" : "Show passwords"}</Text></TouchableOpacity>
      <TouchableOpacity style={[s.primary, loading && {opacity:.55}]} disabled={loading} onPress={submit}>{loading ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryText}>Update Password</Text>}</TouchableOpacity>
    </View>
  </KeyboardAvoidingView></SafeAreaView>;
}

function Field({label,value,onChange,visible,hint}:{label:string;value:string;onChange:(v:string)=>void;visible:boolean;hint?:string}) {
  return <View style={{marginBottom:16}}><Text style={s.label}>{label}</Text><TextInput style={s.input} value={value} onChangeText={onChange} secureTextEntry={!visible} autoCapitalize="none" placeholder={hint || `Enter ${label.toLowerCase()}`} placeholderTextColor="#94A3B8" /></View>;
}

const s=StyleSheet.create({safe:{flex:1,backgroundColor:"#F5F7FB"},page:{flex:1,padding:22},back:{width:42,height:42,borderRadius:14,backgroundColor:"#fff",alignItems:"center",justifyContent:"center"},icon:{width:60,height:60,borderRadius:20,backgroundColor:"#DBEAFE",alignSelf:"center",alignItems:"center",justifyContent:"center",marginTop:24},title:{fontSize:28,fontWeight:"900",color:"#0F172A",textAlign:"center",marginTop:14},sub:{fontSize:15,color:"#64748B",textAlign:"center",marginTop:7,marginBottom:24},card:{backgroundColor:"#fff",padding:20,borderRadius:22},label:{fontSize:14,fontWeight:"700",color:"#334155",marginBottom:8},input:{height:54,borderWidth:1,borderColor:"#DCE3EE",borderRadius:14,paddingHorizontal:14,fontSize:15,color:"#0F172A"},show:{flexDirection:"row",gap:7,alignItems:"center",marginTop:-3,marginBottom:20},showText:{color:"#2563EB",fontWeight:"700"},primary:{height:56,borderRadius:16,backgroundColor:"#2563EB",alignItems:"center",justifyContent:"center"},primaryText:{color:"#fff",fontWeight:"800",fontSize:16}});
