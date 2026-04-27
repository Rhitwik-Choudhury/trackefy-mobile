import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SafeAreaView } from "react-native-safe-area-context";
import socket from "../services/socket";

export default function ParentScreen() {
  const router = useRouter();
  const [parentData, setParentData] = useState<any>(null);
  const [busLocation, setBusLocation] = useState<any>(null);
  const parent = parentData?.parent;
  const child = parent?.children?.[0];
  const bus = child?.busId;
  const driver = bus?.driverId;

  useEffect(() => {
    const fetchParent = async () => {
      try {
        const token = await AsyncStorage.getItem("token");

        const res = await fetch(
          "https://kidharhaibus-backend-production.up.railway.app/api/parent/me",
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        const data = await res.json();
        setParentData(data);
      } catch (err) {
        console.log(err);
      }
    };

    fetchParent();
  }, []);

  useEffect(() => {
    if (!bus?._id) return;

    socket.emit("joinBusRoom", { busId: bus._id });

    socket.on("location-update", (data) => {
      console.log("LIVE LOCATION:", data);
      setBusLocation(data);
    });

    socket.on("alert", (data) => {
      alert(data.message);
    });

    return () => {
      socket.off("location-update");
      socket.off("alert");
    };
  }, [bus?._id]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#f5f6fa" }}>
      <View style={styles.container}>
        {/* HEADER */}
        <Text style={styles.header}>Hello,</Text>
        <Text style={styles.name}>{parent?.fullName || "Parent"}</Text>

        {/* BUS CARD */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>🚌 Assigned Bus</Text>

          <Text style={styles.busNumber}>
            {bus?.busNumber || "--"}
          </Text>

          <Text style={styles.route}>
            Route: {bus?.route || "N/A"}
          </Text>
          <Text style={styles.infoText}>
            Status: {busLocation ? "🟢 Live" : "⚪ Offline"}
          </Text>
        </View>

        {/* CHILD + DRIVER INFO */}
        <View style={styles.infoCard}>
          <Text style={styles.infoText}>
            👦 Child: {child?.name || "N/A"}
          </Text>

          <Text style={styles.infoText}>
            👨‍✈️ Driver: {driver?.fullName || "Not Assigned"}
          </Text>

          <Text style={styles.infoText}>
            ETA: -- mins
          </Text>
        </View>

        {/* BUTTON */}
        <TouchableOpacity style={styles.button}>
          <Text style={styles.buttonText}>Track Bus</Text>
        </TouchableOpacity>

        {/* LOGOUT */}
        <TouchableOpacity
          style={{ marginTop: 20 }}
          onPress={() => router.replace("/")}
        >
          <Text style={{ color: "#555" }}>Logout</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: "#f5f6fa",
  },

  header: {
    fontSize: 18,
    color: "#666",
  },

  name: {
    fontSize: 26,
    fontWeight: "bold",
    color: "#2563eb",
    marginBottom: 20,
  },

  card: {
    backgroundColor: "#fff",
    padding: 20,
    borderRadius: 12,
    marginBottom: 20,
    elevation: 3,
  },

  cardTitle: {
    fontSize: 16,
    color: "#555",
    marginBottom: 10,
  },

  busNumber: {
    fontSize: 40,
    fontWeight: "bold",
    color: "#2563eb",
  },

  route: {
    color: "#666",
    marginTop: 5,
  },

  infoCard: {
    backgroundColor: "#fff",
    padding: 20,
    borderRadius: 12,
    elevation: 2,
  },

  infoText: {
    fontSize: 16,
    marginBottom: 8,
    color: "#333",
  },

  button: {
    marginTop: 30,
    backgroundColor: "#2563eb",
    padding: 15,
    borderRadius: 10,
    alignItems: "center",
  },

  buttonText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 16,
  },
});