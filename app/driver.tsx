import { View, Text, TouchableOpacity, StyleSheet, Linking, BackHandler } from "react-native";
import { useRouter } from "expo-router";
import { useEffect, useState, useRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import socket from "../services/socket";
import { BASE_URL } from "../constants/api";

const BACKGROUND_LOCATION_TASK = "TRACKefy_DRIVER_BACKGROUND_LOCATION";

const LAST_SENT_LOCATION_KEY = "TRACKefy_LAST_SENT_LOCATION";

const MAX_ALLOWED_ACCURACY = 50; // meters
const MIN_MOVEMENT_METERS = 12; // ignore tiny GPS shaking
const MAX_REASONABLE_SPEED_MPS = 35; // ~126 km/h, rejects sudden jumps
const SMOOTHING_FACTOR = 0.35; // 35% new point, 65% previous point

const getDistanceInMeters = (
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
) => {
  const R = 6371e3;
  const toRad = (value: number) => (value * Math.PI) / 180;

  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δφ = toRad(lat2 - lat1);
  const Δλ = toRad(lng2 - lng1);

  const a =
    Math.sin(Δφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;

  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const getFilteredDriverLocation = async (coords: any) => {
  const accuracy =
    typeof coords.accuracy === "number" ? coords.accuracy : null;

  if (accuracy !== null && accuracy > MAX_ALLOWED_ACCURACY) {
    console.log("📍 Ignored low accuracy GPS:", accuracy);
    return null;
  }

  const current = {
    lat: coords.latitude,
    lng: coords.longitude,
    timestamp: Date.now(),
  };

  const saved = await AsyncStorage.getItem(LAST_SENT_LOCATION_KEY);

  if (!saved) {
    await AsyncStorage.setItem(
      LAST_SENT_LOCATION_KEY,
      JSON.stringify(current)
    );
    return current;
  }

  const last = JSON.parse(saved);

  const distance = getDistanceInMeters(
    last.lat,
    last.lng,
    current.lat,
    current.lng
  );

  const timeDiffSeconds = Math.max(
    (current.timestamp - last.timestamp) / 1000,
    1
  );

  const speed = distance / timeDiffSeconds;

  if (distance < MIN_MOVEMENT_METERS) {
    console.log("📍 Ignored tiny GPS movement:", distance.toFixed(2), "m");
    return null;
  }

  if (speed > MAX_REASONABLE_SPEED_MPS && distance > 100) {
    console.log("📍 Ignored GPS jump:", {
      distance: distance.toFixed(2),
      speed: speed.toFixed(2),
    });
    return null;
  }

  const smoothed = {
    lat: last.lat + (current.lat - last.lat) * SMOOTHING_FACTOR,
    lng: last.lng + (current.lng - last.lng) * SMOOTHING_FACTOR,
    timestamp: current.timestamp,
  };

  await AsyncStorage.setItem(
    LAST_SENT_LOCATION_KEY,
    JSON.stringify(smoothed)
  );

  return smoothed;
};

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
    const filteredLocation = await getFilteredDriverLocation(location.coords);

    if (!filteredLocation) return;

    await fetch(`${BASE_URL}/driver/location`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        lat: filteredLocation.lat,
        lng: filteredLocation.lng,
      }),
    });

    console.log("📍 Background location sent:", {
      lat: filteredLocation.lat,
      lng: filteredLocation.lng,
    });
  } catch (err) {
    console.log("Background location send error:", err);
  }
});

export default function DriverScreen() {
  const router = useRouter();
  useEffect(() => {
    const backAction = () => {
      BackHandler.exitApp();
      return true;
    };

    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      backAction
    );

    return () => subscription.remove();
  }, []);
  const [driverData, setDriverData] = useState<any>(null);
  const [menuOpen, setMenuOpen] = useState(false);
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

      if (!res.ok) {
        throw new Error("Invalid or expired session");
      }

      const data = await res.json();
      if (!data.driver) {
        throw new Error("Driver data not found");
      }
      setDriverData(data.driver);
    } catch (err) {
      console.log("Driver profile fetch failed:", err);
      await AsyncStorage.multiRemove(["token", "role", "parentData"]);
      router.replace("/");
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
        if (!socket.connected) {
          socket.connect();
        }
        const filteredLocation = await getFilteredDriverLocation(location.coords);

        if (!filteredLocation) return;

        socket.emit("driverLocation", {
          driverId: currentDriver._id,
          busId,
          lat: filteredLocation.lat,
          lng: filteredLocation.lng,
        });

        try {
          const token = await AsyncStorage.getItem("token");

          await fetch(`${BASE_URL}/driver/location`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              lat: filteredLocation.lat,
              lng: filteredLocation.lng,
            }),
          });

          console.log("📍 Foreground REST backup location sent:", {
            lat: filteredLocation.lat,
            lng: filteredLocation.lng,
          });
        } catch (err) {
          console.log("Foreground REST backup location failed:", err);
        }        

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

    await AsyncStorage.removeItem(LAST_SENT_LOCATION_KEY);
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

      if (!socket.connected) {
        socket.connect();
      }

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

      if (!socket.connected) {
        socket.connect();
      }

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

        {/* MENU */}
        <View style={styles.menuWrapper}>
          <TouchableOpacity
            style={styles.menuButton}
            onPress={() => setMenuOpen(!menuOpen)}
          >
            <Text style={styles.menuIcon}>☰</Text>
          </TouchableOpacity>

          {menuOpen && (
            <View style={styles.dropdown}>
              
              <TouchableOpacity
                style={styles.dropdownItem}
                onPress={async () => {
                  setMenuOpen(false);

                  const supported = await Linking.canOpenURL(
                    "https://forms.gle/4skdJE5whtdKPri16"
                  );

                  if (supported) {
                    await Linking.openURL(
                      "https://forms.gle/4skdJE5whtdKPri16"
                    );
                  } else {
                    alert("Unable to open feedback form.");
                  }
                }}
              >
                <Text style={styles.dropdownText}>
                  💬 Feedback
                </Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={styles.dropdownItem}
                onPress={() => {
                  setMenuOpen(false);
                  Linking.openURL("https://trackefy.in/delete-account");
                }}
              >
                <Text style={[styles.dropdownText, { color: "#dc2626" }]}>
                  Delete Account
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.dropdownItem}
                onPress={async () => {
                  setMenuOpen(false);
                  await AsyncStorage.multiRemove(["token", "role", "parentData"]);
                  router.replace("/");
                }}
              >
                <Text style={[styles.dropdownText, { color: "#ef4444" }]}>
                  Logout
                </Text>
              </TouchableOpacity>
            </View>
          )}
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
  menuWrapper: {
    position: "absolute",
    top: 50,
    right: 20,
    zIndex: 20,
    alignItems: "flex-end",
  },

  menuButton: {
    backgroundColor: "#ffffff",
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    elevation: 3,
  },

  menuIcon: {
    fontSize: 26,
    fontWeight: "bold",
    color: "#111827",
  },

  dropdown: {
    marginTop: 8,
    backgroundColor: "#ffffff",
    borderRadius: 12,
    paddingVertical: 8,
    width: 170,
    elevation: 6,
  },

  dropdownItem: {
    paddingVertical: 12,
    paddingHorizontal: 14,
  },

  dropdownText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
  },
});