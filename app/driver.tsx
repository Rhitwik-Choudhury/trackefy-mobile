import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useEffect, useState, useRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import socket from "../services/socket";
import { BASE_URL } from "../constants/api";

const BACKGROUND_LOCATION_TASK = "TRACKefy_DRIVER_BACKGROUND_LOCATION";

TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }: any) => {
  if (error) {
    console.log("Background location task error:", error);
    return;
  }

  try {
    const locations = data?.locations;
    const location = locations?.[0];

    if (!location) return;

    const token = await AsyncStorage.getItem("token");

    if (!token) {
      console.log("No token found for background location update");
      return;
    }

    await fetch(`${BASE_URL}/driver/location`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        lat: location.coords.latitude,
        lng: location.coords.longitude,
      }),
    });

    console.log("📍 Background location sent:", {
      lat: location.coords.latitude,
      lng: location.coords.longitude,
    });
  } catch (err) {
    console.log("Background location send error:", err);
  }
});

export default function DriverScreen() {
  const router = useRouter();
  const [driverData, setDriverData] = useState<any>(null);
  const locationWatcher = useRef<any>(null);
  const isOnTrip = driverData?.isOnTrip;

  useEffect(() => {
    fetchDriver();
  }, []);

  useEffect(() => {
    if (driverData?.isOnTrip) {
      startTracking(driverData);
    }
  }, [driverData?.isOnTrip]);

  const fetchDriver = async () => {
    try {
      const token = await AsyncStorage.getItem("token");

      const res = await fetch(
        `${BASE_URL}/driver/me`,
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

  // ✅ START TRACKING ONLY WHEN TRIP STARTS
  const startTracking = async (driver: any) => {
    if (locationWatcher.current) {
      return;
    }
    const { status: foregroundStatus } =
      await Location.requestForegroundPermissionsAsync();

    if (foregroundStatus !== "granted") {
      alert("Foreground location permission is required");
      return;
    }

    const { status: backgroundStatus } =
      await Location.requestBackgroundPermissionsAsync();

    if (backgroundStatus !== "granted") {
      alert(
        "Background location permission is required so parents can track the bus when the driver locks the phone."
      );
      return;
    }

    // ✅ Foreground tracking: keep existing smooth realtime socket behavior
    locationWatcher.current = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        timeInterval: 3000,
        distanceInterval: 5,
      },
      async (location) => {
        const currentDriver = driverData || driver;

        if (!currentDriver?.busId) return;

        const busId =
          typeof currentDriver.busId === "object"
            ? currentDriver.busId._id
            : currentDriver.busId;

        // Existing socket realtime flow
        socket.emit("driverLocation", {
          driverId: currentDriver._id,
          busId,
          lat: location.coords.latitude,
          lng: location.coords.longitude,
        });
      }
    );

    const hasStarted =
      await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);

    if (!hasStarted) {
      await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
        accuracy: Location.Accuracy.High,
        timeInterval: 5000,
        distanceInterval: 10,

        // ✅ Android foreground service for background tracking
        foregroundService: {
          notificationTitle: "Trackefy trip is active",
          notificationBody: "Sharing bus location with parents",
          notificationColor: "#2563eb",
        },

        // iOS related, harmless for Android
        showsBackgroundLocationIndicator: true,
        pausesUpdatesAutomatically: false,
      });
    }

    console.log("✅ Foreground + background tracking started");
  };

  const stopTracking = async () => {
    if (locationWatcher.current) {
      locationWatcher.current.remove();
      locationWatcher.current = null;
    }

    const hasStarted =
      await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);

    if (hasStarted) {
      await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
    }

    console.log("🛑 Foreground + background tracking stopped");
  };

  const handleStartTrip = async () => {
    try {
      const token = await AsyncStorage.getItem("token");

      await fetch(
        `${BASE_URL}/driver/start-trip`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      // 🔥 refresh driver
      const res = await fetch(
        `${BASE_URL}/driver/me`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await res.json();
      setDriverData(data.driver);

      const busId =
        typeof data.driver.busId === "object"
          ? data.driver.busId._id
          : data.driver.busId;

      socket.emit("trip:start", {
        driverId: data.driver._id,
        busId,
      });

    } catch (err) {
      console.log(err);
    }
  };

  const handleEndTrip = async () => {
    try {
      const token = await AsyncStorage.getItem("token");

      await fetch(
        `${BASE_URL}/driver/end-trip`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const currentBusId =
        typeof driverData.busId === "object"
          ? driverData.busId._id
          : driverData.busId;

      socket.emit("trip:end", {
        driverId: driverData._id,
        busId: currentBusId,
      });

      // 🔥 stop tracking immediately
      await stopTracking();

      fetchDriver();
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

        {/* TRIP STATUS */}
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
        <View style={{ position: "absolute", top: 50, right: 20, zIndex: 10 }}>
          <TouchableOpacity
            onPress={async () => {
              await AsyncStorage.removeItem("token");
              router.replace("/");
            }}
            style={{
              backgroundColor: "#ef4444",
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 8,
            }}
          >
            <Text style={{ color: "white", fontWeight: "600" }}>Logout</Text>
          </TouchableOpacity>
        </View>
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