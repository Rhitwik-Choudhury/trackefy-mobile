import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Location from "expo-location";
import socket from "../services/socket";

export default function DriverScreen() {
  const router = useRouter();

  const [driverData, setDriverData] = useState<any>(null);
  const isOnTrip = driverData?.isOnTrip;

  useEffect(() => {
    fetchDriver();
  }, []);
  
  useEffect(() => {
    let subscription: any;

    const startTracking = async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;

      subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 3000,
          distanceInterval: 5,
        },
        (location) => {
          if (!driverData?.busId || !driverData?.isOnTrip) return;

          const busId =
            typeof driverData.busId === "object"
              ? driverData.busId._id
              : driverData.busId;

          socket.emit("driverLocation", {
            driverId: driverData._id,
            busId,
            lat: location.coords.latitude,
            lng: location.coords.longitude,
          });
        }
      );
    };

    if (driverData) startTracking();

    return () => subscription?.remove();
  }, [driverData]);

  const fetchDriver = async () => {
    try {
      const token = await AsyncStorage.getItem("token");

      const res = await fetch(
        "https://kidharhaibus-backend-production.up.railway.app/api/driver/me",
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await res.json();

      setDriverData(data.driver);
    } catch (err) {
      console.log(err);
    }
  };

  const handleStartTrip = async () => {
    try {
      const token = await AsyncStorage.getItem("token");

      await fetch(
        "https://kidharhaibus-backend-production.up.railway.app/api/driver/start-trip",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      fetchDriver(); // ✅ ADD THIS
    } catch (err) {
      console.log(err);
    }
  };

  const handleEndTrip = async () => {
    try {
      const token = await AsyncStorage.getItem("token");

      await fetch(
        "https://kidharhaibus-backend-production.up.railway.app/api/driver/end-trip",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      fetchDriver(); // ✅ ADD THIS
    } catch (err) {
      console.log(err);
    }
  };

  const bus = driverData?.busId;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#f5f6fa" }}>
      <View style={styles.container}>
        {/* HEADER */}
        <Text style={styles.header}>Hello,</Text>
        <Text style={styles.name}>{driverData?.fullName || "Driver"}</Text>

        {/* BUS CARD */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>🚌 Assigned Bus</Text>

          <Text style={styles.busNumber}>
            {bus?.busNumber || "--"}
          </Text>

          <Text style={styles.route}>
            Route: {bus?.route || "N/A"}
          </Text>
        </View>

        {/* TRIP STATUS CARD */}
        <View style={styles.statusCard}>
          <Text style={styles.statusTitle}>Trip Status</Text>

          <View style={styles.statusBadge}>
            <Text style={styles.statusText}>
              {isOnTrip ? "Started" : "Not Started"}
            </Text>
          </View>
        </View>

        {/* BUTTON */}
        {isOnTrip ? (
          <TouchableOpacity style={styles.endButton} onPress={handleEndTrip}>
            <Text style={styles.buttonText}>End Trip</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.startButton} onPress={handleStartTrip}>
            <Text style={styles.buttonText}>Start Trip</Text>
          </TouchableOpacity>
        )}

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

  statusCard: {
    backgroundColor: "#fff",
    padding: 20,
    borderRadius: 12,
    marginBottom: 20,
    elevation: 2,
  },

  statusTitle: {
    color: "#666",
    marginBottom: 10,
  },

  statusBadge: {
    borderWidth: 2,
    borderColor: "#f59e0b",
    padding: 10,
    borderRadius: 10,
    alignSelf: "flex-start",
  },

  statusText: {
    color: "#f59e0b",
    fontWeight: "bold",
  },

  startButton: {
    backgroundColor: "#22c55e",
    padding: 15,
    borderRadius: 10,
    alignItems: "center",
  },

  endButton: {
    backgroundColor: "#ef4444",
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