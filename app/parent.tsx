// import "../firebase";
import notifee from '@notifee/react-native';
import { View, Text, TouchableOpacity, StyleSheet, Image, Modal, Linking, BackHandler, Dimensions, ScrollView} from "react-native";
import { useRouter } from "expo-router";
import { useEffect, useState, useRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SafeAreaView } from "react-native-safe-area-context";
import socket from "../services/socket";
import MapView, { Marker, Polyline } from "react-native-maps";
import * as Location from 'expo-location';
import { BASE_URL } from "../constants/api";
import messaging from '@react-native-firebase/messaging';
// import { getApp } from '@react-native-firebase/app';

const { height: SCREEN_HEIGHT } = Dimensions.get("window");
const MAP_HEIGHT = SCREEN_HEIGHT * 0.60;

export default function ParentScreen() {
  const [loading, setLoading] = useState(true);
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

  const [parentData, setParentData] = useState<any>(null);
  const [busLocation, setBusLocation] = useState<any>(null);
  const [animatedLocation, setAnimatedLocation] = useState<any>(null);
  const [tripStatus, setTripStatus] = useState<string>("idle");
  const [path, setPath] = useState<any[]>([]);
  const [pickupLocation, setPickupLocation] = useState<any>(null);

  const [isPickingLocation, setIsPickingLocation] = useState(false);
  const [tempLocation, setTempLocation] = useState<any>(null);

  const [isAutoFollow, setIsAutoFollow] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const mapRef = useRef<any>(null);
  
  const markerAnimationRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const displayedLocationRef = useRef<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const lastLocationTimestampRef = useRef<number>(0);
  const pollingInProgressRef = useRef(false);

  const parent = parentData;

  const child =
    parent?.children && parent.children.length > 0
      ? parent.children[0]
      : null;

  const bus = child?.busId || null;

  const driver = bus?.driverId || null;

  // ================= FCM SETUP =================
  useEffect(() => {
    const setupFCM = async () => {
      try {
        // 🔥 Ensure Firebase is initialized

        await messaging().registerDeviceForRemoteMessages();
        await messaging().requestPermission();
        await notifee.requestPermission();

        const token = await messaging().getToken();
        console.log("FCM TOKEN:", token);

        const authToken = await AsyncStorage.getItem("token");

        await fetch(`${BASE_URL}/parent/save-fcm-token`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({ token }),
        });

        console.log("TOKEN SENT TO BACKEND:", token);

      } catch (err) {
        console.log("FCM setup error:", err);
      }
    };

    setupFCM();

    const unsubscribe = messaging().onMessage(async remoteMessage => {

      console.log(
        "🔥 FOREGROUND FCM:",
        JSON.stringify(remoteMessage, null, 2)
      );

      const title =
        remoteMessage?.notification?.title ||
        remoteMessage?.data?.title;

      const body =
        remoteMessage?.notification?.body ||
        remoteMessage?.data?.body;

      if (title || body) {
        alert(`${title || ""}\n${body || ""}`);
      }
    });

    return unsubscribe;
  }, []);

  const applyInitialBusState = (parent: any) => {
    const loadedChild =
      parent?.children && parent.children.length > 0
        ? parent.children[0]
        : null;

    const loadedBus = loadedChild?.busId || null;

    if (!loadedBus) return;

    // ✅ Load saved/current trip status from backend
    if (loadedBus.tripStatus) {
      setTripStatus(loadedBus.tripStatus);
    }

    // ✅ Load current live bus location from backend
    if (
      loadedBus.currentLocation &&
      loadedBus.currentLocation.lat !== null &&
      loadedBus.currentLocation.lng !== null &&
      loadedBus.currentLocation.lat !== undefined &&
      loadedBus.currentLocation.lng !== undefined
    ) {
      const coord = {
        latitude: loadedBus.currentLocation.lat,
        longitude: loadedBus.currentLocation.lng,
      };

      setBusLocation({
        lat: loadedBus.currentLocation.lat,
        lng: loadedBus.currentLocation.lng,
        lastLocationUpdatedAt: loadedBus.lastLocationUpdatedAt,
      });

      displayedLocationRef.current = coord;

      const initialTimestamp = loadedBus.lastLocationUpdatedAt
        ? new Date(loadedBus.lastLocationUpdatedAt).getTime()
        : Date.now();

      if (Number.isFinite(initialTimestamp)) {
        lastLocationTimestampRef.current = initialTimestamp;
      }

      setAnimatedLocation(coord);
      setPath([coord]);

      setTimeout(() => {
        mapRef.current?.animateToRegion({
          latitude: coord.latitude,
          longitude: coord.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        });
      }, 500);
    }

    // ✅ Load saved pickup location if backend sends it
    if (
      parent?.pickupLocation?.coordinates &&
      parent.pickupLocation.coordinates.length === 2
    ) {
      setPickupLocation({
        latitude: parent.pickupLocation.coordinates[1],
        longitude: parent.pickupLocation.coordinates[0],
      });
    }

    // ✅ If your backend still sends stopLocation instead of pickupLocation
    if (
      parent?.stopLocation &&
      parent.stopLocation.lat !== undefined &&
      parent.stopLocation.lng !== undefined
    ) {
      setPickupLocation({
        latitude: parent.stopLocation.lat,
        longitude: parent.stopLocation.lng,
      });
    }
  };

  // ================= FETCH =================
  useEffect(() => {
    const loadParent = async () => {
      try {
        const token = await AsyncStorage.getItem("token");

        const res = await fetch(`${BASE_URL}/parent/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          throw new Error("Invalid or expired session");
        }

        const data = await res.json();
        
        if (!data.parent) {
          throw new Error("Parent data not found");
        }

        setParentData(data.parent);
        // ✅ IMPORTANT: hydrate dashboard from backend immediately
        applyInitialBusState(data.parent);
        setLoading(false);

      } catch (err) {
        console.log("Parent profile fetch failed:", err);
        await AsyncStorage.multiRemove(["token", "role", "parentData"]);
        setLoading(false);
        router.replace("/");
      }
    };

    loadParent();
  }, []);

  // ================= SMOOTH BUS MARKER MOVEMENT =================
  const moveBusMarker = (newCoord: {
    latitude: number;
    longitude: number;
  }) => {
    // Stop the previous animation before starting a new one.
    if (markerAnimationRef.current) {
      clearInterval(markerAnimationRef.current);
      markerAnimationRef.current = null;
    }

    const start = displayedLocationRef.current;

    // First valid location: show it immediately.
    if (!start) {
      displayedLocationRef.current = newCoord;
      setAnimatedLocation(newCoord);
      return;
    }

    const duration = 2000;
    const frameInterval = 50;
    const totalSteps = Math.max(
      Math.round(duration / frameInterval),
      1
    );

    let currentStep = 0;

    markerAnimationRef.current = setInterval(() => {
      currentStep += 1;

      const progress = Math.min(currentStep / totalSteps, 1);

      // Smooth easing instead of linear movement.
      const easedProgress =
        progress < 0.5
          ? 2 * progress * progress
          : 1 - Math.pow(-2 * progress + 2, 2) / 2;

      const nextPosition = {
        latitude:
          start.latitude +
          (newCoord.latitude - start.latitude) * easedProgress,

        longitude:
          start.longitude +
          (newCoord.longitude - start.longitude) * easedProgress,
      };

      displayedLocationRef.current = nextPosition;
      setAnimatedLocation(nextPosition);

      if (progress >= 1) {
        if (markerAnimationRef.current) {
          clearInterval(markerAnimationRef.current);
          markerAnimationRef.current = null;
        }

        // Force the final position to the exact received coordinate.
        displayedLocationRef.current = newCoord;
        setAnimatedLocation(newCoord);
      }
    }, frameInterval);
  };

  // ================= PROCESS LOCATION UPDATE =================
  const processLocationUpdate = (
    lat: unknown,
    lng: unknown,
    updatedAt?: string | number | Date
  ) => {
    const newCoord = {
      latitude: Number(lat),
      longitude: Number(lng),
    };

    if (
      !Number.isFinite(newCoord.latitude) ||
      !Number.isFinite(newCoord.longitude)
    ) {
      console.log("Invalid location update ignored:", { lat, lng });
      return;
    }

    const updateTimestamp = updatedAt
      ? new Date(updatedAt).getTime()
      : Date.now();

    if (!Number.isFinite(updateTimestamp)) {
      return;
    }

    // Ignore an older update arriving after a newer one.
    if (
      lastLocationTimestampRef.current > 0 &&
      updateTimestamp < lastLocationTimestampRef.current
    ) {
      return;
    }

    const current = displayedLocationRef.current;

    // Avoid processing the same coordinate twice.
    if (
      current &&
      Math.abs(current.latitude - newCoord.latitude) < 0.000001 &&
      Math.abs(current.longitude - newCoord.longitude) < 0.000001
    ) {
      lastLocationTimestampRef.current = Math.max(
        lastLocationTimestampRef.current,
        updateTimestamp
      );
      return;
    }

    lastLocationTimestampRef.current = updateTimestamp;

    setBusLocation({
      lat: newCoord.latitude,
      lng: newCoord.longitude,
      lastLocationUpdatedAt: updatedAt,
    });

    moveBusMarker(newCoord);

    setPath((previousPath) => {
      const updatedPath = [...previousPath, newCoord];
      return updatedPath.slice(-100);
    });
  };
  
  // ================= SOCKET =================
  useEffect(() => {
    if (!bus?._id) return;

    const joinRoom = () => {
      console.log("🚌 Joining bus room:", bus._id);
      socket.emit("joinBusRoom", { busId: bus._id });
    };

    if (socket.connected) {
      joinRoom();
    } else {
      socket.connect();
    }

    socket.on("connect", joinRoom);

    const handleLocationUpdate = (data: any) => {
      processLocationUpdate(
        data.lat,
        data.lng,
        data.lastLocationUpdatedAt
      );

      setTripStatus("started");
    };

    // ✅ Normal foreground socket update
    socket.on("location-update", handleLocationUpdate);

    socket.on("tripStatus", (data) => {
      setTripStatus(data.status);
    });

    socket.on("alert", (data) => {
      alert(data.message);
    });

    return () => {
      socket.off("connect", joinRoom);
      socket.off("location-update", handleLocationUpdate);
      socket.off("tripStatus");
      socket.off("alert");
    };
  }, [bus?._id]);

  // ================= POLLING FALLBACK =================
  useEffect(() => {
    if (!bus?._id) return;

    let isCancelled = false;

    const fetchLatestBusLocation = async () => {
      if (pollingInProgressRef.current) return;

      pollingInProgressRef.current = true;

      try {
        const token = await AsyncStorage.getItem("token");

        if (!token) return;

        const response = await fetch(`${BASE_URL}/parent/my-bus`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          console.log(
            "Bus-location polling failed with status:",
            response.status
          );
          return;
        }

        const data = await response.json();
        const latestBus = data?.bus;

        if (isCancelled || !latestBus) return;

        if (latestBus.tripStatus) {
          setTripStatus(latestBus.tripStatus);
        }

        const latestLocation = latestBus.currentLocation;

        if (
          latestLocation?.lat !== undefined &&
          latestLocation?.lng !== undefined
        ) {
          processLocationUpdate(
            latestLocation.lat,
            latestLocation.lng,
            latestBus.lastLocationUpdatedAt
          );
        }
      } catch (error) {
        console.log("Bus-location polling error:", error);
      } finally {
        pollingInProgressRef.current = false;
      }
    };

    // Sync immediately when the bus becomes available.
    fetchLatestBusLocation();

    const pollingInterval = setInterval(
      fetchLatestBusLocation,
      8000
    );

    return () => {
      isCancelled = true;
      clearInterval(pollingInterval);
      pollingInProgressRef.current = false;
    };
  }, [bus?._id]);

  // ================= AUTO FOLLOW =================
  useEffect(() => {
    if (animatedLocation && tripStatus === "started" && isAutoFollow) {
      mapRef.current?.animateToRegion({
        latitude: animatedLocation.latitude,
        longitude: animatedLocation.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      });
    }
  }, [animatedLocation, isAutoFollow, tripStatus]);

  // ================= CLEANUP =================
  useEffect(() => {
    return () => {
      if (markerAnimationRef.current) {
        clearInterval(markerAnimationRef.current);
        markerAnimationRef.current = null;
      }
    };
  }, []);

  // ================= CURRENT LOCATION =================
  const useCurrentLocation = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();

    if (status !== "granted") {
      alert("Permission denied");
      return;
    }

    const location = await Location.getCurrentPositionAsync({});

    setTempLocation({
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
    });
  };

  const getStatusText = () => {
    if (tripStatus === "started") return "🟢 Live";
    if (tripStatus === "ended") return "🔴 Trip Ended";
    return "⚪ Waiting";
  };

  if (loading || !parentData) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <Text>Loading...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#f5f6fa" }}>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topRow}>
          <View>
            <Text style={styles.header}>Hello,</Text>
            <Text style={styles.name}>{parent?.fullName || "Parent"}</Text>
          </View>

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
                onPress={() => {
                  setMenuOpen(false);
                  setDetailsOpen(true);
                }}
              >
                <Text style={styles.dropdownText}>Show Details</Text>
              </TouchableOpacity>
              
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

        <View style={styles.statusCardNew}>
          <Text style={styles.statusLabel}>Trip Status</Text>
          <Text style={styles.statusValue}>{getStatusText()}</Text>
        </View>

        <View style={styles.mapContainer}>
          <MapView
            provider="google"
            ref={mapRef}
            style={styles.map}
            initialRegion={{
              latitude:
                typeof busLocation?.lat === "number"
                  ? busLocation.lat
                  : 26.166449,

              longitude:
                typeof busLocation?.lng === "number"
                  ? busLocation.lng
                  : 91.705355,

              latitudeDelta: 0.01,
              longitudeDelta: 0.01,
            }}
            onTouchStart={() => setIsAutoFollow(false)}
          >
          {animatedLocation && (
            <Marker
              coordinate={animatedLocation}
              anchor={{ x: 0.5, y: 0.5 }}
              flat
              tracksViewChanges={false}
            >
              <Image
                source={require("../assets/bus.png")}
                style={{ width: 40, height: 40 }}
                resizeMode="contain"
              />
            </Marker>
          )}

            {path.length > 0 && (
              <Polyline coordinates={path} strokeWidth={4} strokeColor="#2563eb" />
            )}

            {pickupLocation && (
              <Marker coordinate={pickupLocation} pinColor="green" />
            )}
          </MapView>

          <TouchableOpacity
            onPress={() => {
              if (animatedLocation) {
                mapRef.current.animateToRegion({
                  latitude: animatedLocation.latitude,
                  longitude: animatedLocation.longitude,
                  latitudeDelta: 0.01,
                  longitudeDelta: 0.01,
                });
                setIsAutoFollow(true);
              }
            }}
            style={styles.recenter}
          >
            <Text>📍 Center</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.button}
          onPress={() => setIsPickingLocation(true)}
        >
          <Text style={styles.buttonText}>Set Pickup Location</Text>
        </TouchableOpacity>

        {isPickingLocation && (
          <View style={styles.fullscreen}>
            <MapView
              provider="google"
              style={{ flex: 1 }}
              initialRegion={{
                latitude: pickupLocation?.latitude || 26.1573,
                longitude: pickupLocation?.longitude || 91.8173,
                latitudeDelta: 0.01,
                longitudeDelta: 0.01,
              }}
              onPress={(e) => setTempLocation(e.nativeEvent.coordinate)}
            >
              {tempLocation && (
                <Marker coordinate={tempLocation} pinColor="green" />
              )}
            </MapView>

            <TouchableOpacity
              style={styles.useCurrentBtn}
              onPress={useCurrentLocation}
            >
              <Text style={{ color: "#fff" }}>Use Current Location</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.confirmBtn}
              onPress={async () => {
                if (!tempLocation) return alert("Select location");

                const token = await AsyncStorage.getItem("token");

                await fetch(
                  `${BASE_URL}/parent/set-pickup-location`,
                  {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({
                      lat: tempLocation.latitude,
                      lng: tempLocation.longitude,
                    }),
                  }
                );

                setPickupLocation(tempLocation);
                setIsPickingLocation(false);
                alert("Saved ✅");
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "bold" }}>
                Confirm Location
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => setIsPickingLocation(false)}
            >
              <Text style={{ color: "#fff" }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )}

        <Modal
          visible={detailsOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setDetailsOpen(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.detailsModal}>
              <Text style={styles.detailsTitle}>Bus Details</Text>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Assigned Bus</Text>
                <Text style={styles.detailValue}>{bus?.busNumber || "--"}</Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Route</Text>
                <Text style={styles.detailValue}>{bus?.route || "N/A"}</Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Child</Text>
                <Text style={styles.detailValue}>{child?.name || "N/A"}</Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Driver</Text>
                <Text style={styles.detailValue}>
                  {driver?.fullName || "Not Assigned"}
                </Text>
              </View>

              <TouchableOpacity
                style={styles.closeDetailsBtn}
                onPress={() => setDetailsOpen(false)}
              >
                <Text style={styles.closeDetailsText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    paddingBottom: 60,
  },
  header: { fontSize: 18, color: "#666" },
  name: { fontSize: 26, fontWeight: "bold", color: "#2563eb", marginBottom: 20 },
  card: { backgroundColor: "#fff", padding: 15, borderRadius: 12, elevation: 3 },
  cardTitle: { fontWeight: "bold" },
  busNumber: { fontSize: 40, fontWeight: "bold", color: "#2563eb" },
  route: { color: "#666" },
  status: { marginTop: 5, fontWeight: "bold" },
  infoCard: { backgroundColor: "#fff", padding: 15, borderRadius: 12, marginTop: 15 },
  infoText: { marginBottom: 5 },
  mapContainer: {
    marginTop: 12,
    position: "relative",
    borderRadius: 16,
    overflow: "hidden",
  },

  map: {
    height: MAP_HEIGHT,
  },
  recenter: {
    position: "absolute",
    bottom: 15,
    right: 15,
    backgroundColor: "#fff",
    padding: 10,
    borderRadius: 20,
    elevation: 3,
  },
  button: {
    marginTop: 16,
    backgroundColor: "#2563eb",
    padding: 15,
    borderRadius: 10,
    alignItems: "center",
  },
  buttonText: { color: "#fff", fontWeight: "bold" },
  fullscreen: {
    position: "absolute",
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "#fff",
    zIndex: 100,
  },
  useCurrentBtn: {
    position: "absolute",
    top: 50,
    left: 20,
    backgroundColor: "#2563eb",
    padding: 10,
    borderRadius: 8,
  },
  confirmBtn: {
    position: "absolute",
    bottom: 40,
    left: 20,
    right: 20,
    backgroundColor: "#2563eb",
    padding: 15,
    borderRadius: 10,
    alignItems: "center",
  },
  cancelBtn: {
    position: "absolute",
    top: 50,
    right: 20,
    backgroundColor: "#ef4444",
    padding: 10,
    borderRadius: 8,
  },
  logoutBtn: {
    position: "absolute",
    top: 50,
    right: 20,
    backgroundColor: "#ef4444",
    padding: 10,
    borderRadius: 8,
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 20,
    position: "relative",
    zIndex: 20,
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
    position: "absolute",
    top: 52,
    right: 0,
    backgroundColor: "#ffffff",
    borderRadius: 12,
    paddingVertical: 8,
    width: 160,
    elevation: 6,
    zIndex: 50,
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

  statusCardNew: {
    backgroundColor: "#ffffff",
    padding: 16,
    borderRadius: 14,
    marginBottom: 16,
    elevation: 2,
  },

  statusLabel: {
    color: "#6b7280",
    fontSize: 14,
    marginBottom: 6,
  },

  statusValue: {
    fontSize: 20,
    fontWeight: "800",
    color: "#111827",
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },

  detailsModal: {
    width: "100%",
    backgroundColor: "#ffffff",
    borderRadius: 18,
    padding: 20,
    elevation: 8,
  },

  detailsTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#2563eb",
    marginBottom: 18,
  },

  detailRow: {
    marginBottom: 14,
  },

  detailLabel: {
    color: "#6b7280",
    fontSize: 14,
    marginBottom: 4,
  },

  detailValue: {
    color: "#111827",
    fontSize: 17,
    fontWeight: "700",
  },

  closeDetailsBtn: {
    marginTop: 10,
    backgroundColor: "#2563eb",
    padding: 14,
    borderRadius: 12,
    alignItems: "center",
  },

  closeDetailsText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 16,
  },
});