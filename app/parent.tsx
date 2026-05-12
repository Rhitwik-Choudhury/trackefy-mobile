// import "../firebase";
import notifee from '@notifee/react-native';
import { View, Text, TouchableOpacity, StyleSheet, Image } from "react-native";
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

export default function ParentScreen() {
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const [parentData, setParentData] = useState<any>(null);
  const [busLocation, setBusLocation] = useState<any>(null);
  const [animatedLocation, setAnimatedLocation] = useState<any>(null);
  const [tripStatus, setTripStatus] = useState<string>("idle");
  const [path, setPath] = useState<any[]>([]);
  const [pickupLocation, setPickupLocation] = useState<any>(null);

  const [isPickingLocation, setIsPickingLocation] = useState(false);
  const [tempLocation, setTempLocation] = useState<any>(null);

  const [isAutoFollow, setIsAutoFollow] = useState(true);

  const mapRef = useRef<any>(null);

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

        const data = await res.json();

        setParentData(data.parent);
        // ✅ IMPORTANT: hydrate dashboard from backend immediately
        applyInitialBusState(data.parent);
        setLoading(false);

      } catch (err) {
        console.log(err);
      }
    };

    loadParent();
  }, []);

  // ================= SMOOTH ANIMATION =================
  const animateMarker = (start: any, end: any) => {
    let i = 0;
    const steps = 30;

    const latStep = (end.latitude - start.latitude) / steps;
    const lngStep = (end.longitude - start.longitude) / steps;

    const interval = setInterval(() => {
      i++;

      setAnimatedLocation((prev: any) => {
        if (!prev) return start;

        return {
          latitude: prev.latitude + latStep,
          longitude: prev.longitude + lngStep,
        };
      });

      if (i >= steps) clearInterval(interval);
    }, 50);
  };

  // ================= SOCKET =================
  useEffect(() => {
    if (!bus?._id) return;

    socket.emit("joinBusRoom", { busId: bus._id });

    const handleLocationUpdate = (data: any) => {
      const newCoord = {
        latitude: data.lat,
        longitude: data.lng,
      };

      setBusLocation(data);

      setAnimatedLocation((prev: any) => {
        if (!prev) return newCoord;

        animateMarker(prev, newCoord);
        return prev;
      });

      setPath((prev) => {
        const newPath = [...prev, newCoord];
        return newPath.slice(-100);
      });

      setTripStatus("started");
    };

    // ✅ Normal foreground socket update
    socket.on("location-update", handleLocationUpdate);

    // ✅ Background REST update emitted from backend controller
    socket.on("busLocationUpdated", handleLocationUpdate);

    socket.on("tripStatus", (data) => {
      setTripStatus(data.status);
    });

    socket.on("alert", (data) => {
      alert(data.message);
    });

    return () => {
      socket.off("location-update", handleLocationUpdate);
      socket.off("busLocationUpdated", handleLocationUpdate);
      socket.off("tripStatus");
      socket.off("alert");
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
  }, [animatedLocation, isAutoFollow]);

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
      <View style={styles.container}>
        <Text style={styles.header}>Hello,</Text>
        <Text style={styles.name}>{parent?.fullName || "Parent"}</Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>🚌 Assigned Bus</Text>
          <Text style={styles.busNumber}>{bus?.busNumber || "--"}</Text>
          <Text style={styles.route}>Route: {bus?.route || "N/A"}</Text>
          <Text style={styles.status}>Status: {getStatusText()}</Text>
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.infoText}>👦 Child: {child?.name || "N/A"}</Text>
          <Text style={styles.infoText}>
            👨‍✈️ Driver: {driver?.fullName || "Not Assigned"}
          </Text>
        </View>

        <MapView
          provider="google"
          ref={mapRef}
          style={styles.map}
          initialRegion={{
            latitude: busLocation?.lat || 26.1573,
            longitude: busLocation?.lng || 91.8173,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
          }}
          onTouchStart={() => setIsAutoFollow(false)}
        >
          {animatedLocation && (
            <Marker coordinate={animatedLocation}>
              <Image
                source={require("../assets/bus.png")}
                style={{ width: 40, height: 40 }}
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

        <TouchableOpacity
          style={styles.logoutBtn}
          onPress={async () => {
            await AsyncStorage.removeItem("token");
            router.replace("/");
          }}
        >
          <Text style={{ color: "white" }}>Logout</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  header: { fontSize: 18, color: "#666" },
  name: { fontSize: 26, fontWeight: "bold", color: "#2563eb", marginBottom: 20 },
  card: { backgroundColor: "#fff", padding: 15, borderRadius: 12, elevation: 3 },
  cardTitle: { fontWeight: "bold" },
  busNumber: { fontSize: 40, fontWeight: "bold", color: "#2563eb" },
  route: { color: "#666" },
  status: { marginTop: 5, fontWeight: "bold" },
  infoCard: { backgroundColor: "#fff", padding: 15, borderRadius: 12, marginTop: 15 },
  infoText: { marginBottom: 5 },
  map: { height: 300, marginTop: 20, borderRadius: 10 },
  recenter: {
    position: "absolute",
    bottom: 140,
    right: 20,
    backgroundColor: "#fff",
    padding: 10,
    borderRadius: 20,
  },
  button: {
    marginTop: 20,
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
});