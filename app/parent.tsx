// import "../firebase";
import notifee from '@notifee/react-native';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  Modal,
  Linking,
  BackHandler,
  Dimensions,
  ScrollView,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState, useRef, useMemo } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SafeAreaView } from "react-native-safe-area-context";
import socket from "../services/socket";
import { useParentRoute } from '../hooks/use-parent-route';
import ParentEtaCard from '../components/routes/ParentEtaCard';
import { decodeRoute, mapCoordinate, routeRequest } from '../services/routes';
import MapView, { Marker, Polyline } from "react-native-maps";
import * as Location from 'expo-location';
import { BASE_URL } from "../constants/api";
import messaging from '@react-native-firebase/messaging';
// import { getApp } from '@react-native-firebase/app';

const { height: SCREEN_HEIGHT } = Dimensions.get("window");
const MAP_HEIGHT = SCREEN_HEIGHT * 0.60;

type MapCoordinate = {
  latitude: number;
  longitude: number;
};

type PlaceSuggestion = {
  placeId: string;
  mainText: string;
  secondaryText: string;
  fullText: string;
};

const getDistanceBetweenCoordinates = (
  start: MapCoordinate,
  end: MapCoordinate
) => {
  const earthRadius = 6371e3;
  const toRadians = (value: number) => (value * Math.PI) / 180;

  const latitude1 = toRadians(start.latitude);
  const latitude2 = toRadians(end.latitude);

  const latitudeDifference = toRadians(
    end.latitude - start.latitude
  );

  const longitudeDifference = toRadians(
    end.longitude - start.longitude
  );

  const a =
    Math.sin(latitudeDifference / 2) ** 2 +
    Math.cos(latitude1) *
      Math.cos(latitude2) *
      Math.sin(longitudeDifference / 2) ** 2;

  return (
    2 *
    earthRadius *
    Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  );
};

const getBearingBetweenCoordinates = (
  start: MapCoordinate,
  end: MapCoordinate
) => {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const toDegrees = (value: number) => (value * 180) / Math.PI;

  const latitude1 = toRadians(start.latitude);
  const latitude2 = toRadians(end.latitude);

  const longitudeDifference = toRadians(
    end.longitude - start.longitude
  );

  const y =
    Math.sin(longitudeDifference) *
    Math.cos(latitude2);

  const x =
    Math.cos(latitude1) * Math.sin(latitude2) -
    Math.sin(latitude1) *
      Math.cos(latitude2) *
      Math.cos(longitudeDifference);

  const bearing = toDegrees(Math.atan2(y, x));

  return (bearing + 360) % 360;
};

const smoothHeading = (
  currentHeading: number,
  targetHeading: number
) => {
  // Shortest angular path, including crossing 0°/360°.
  const difference =
    ((targetHeading - currentHeading + 540) % 360) - 180;

  const smoothingFactor = 0.4;

  return (
    currentHeading +
    difference * smoothingFactor +
    360
  ) % 360;
};

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

  const [selectedChildId, setSelectedChildId] = useState('');
  const [linkCode, setLinkCode] = useState('');
  const [submittingPickup, setSubmittingPickup] = useState(false);
  const [selectedPlaceId, setSelectedPlaceId] = useState('');
  const [parentData, setParentData] = useState<any>(null);
  const [busLocation, setBusLocation] = useState<any>(null);
  const [animatedLocation, setAnimatedLocation] = useState<any>(null);
  const [busHeading, setBusHeading] = useState(0);
  const [tripStatus, setTripStatus] = useState<string>("idle");
  const [path, setPath] = useState<any[]>([]);
  const [pickupLocation, setPickupLocation] = useState<any>(null);

  const [isPickingLocation, setIsPickingLocation] = useState(false);
  const [tempLocation, setTempLocation] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [placeSuggestions, setPlaceSuggestions] = useState<PlaceSuggestion[]>([]);
  const [isSearchingPlaces, setIsSearchingPlaces] = useState(false);
  const [isSelectingPlace, setIsSelectingPlace] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [selectedAddress, setSelectedAddress] = useState("");

  const [isAutoFollow, setIsAutoFollow] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const mapRef = useRef<any>(null);
  const pickerMapRef = useRef<any>(null);
  const searchRequestRef = useRef<AbortController | null>(null);
  const placeSessionTokenRef = useRef("");
  const pickupSearchBiasRef = useRef<any>(null);
  const skipNextAutocompleteRef = useRef(false);
  
  const markerAnimationRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const displayedLocationRef = useRef<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const lastLocationTimestampRef = useRef<number>(0);
  const hasReceivedFreshLocationRef = useRef(false);
  const lastHeadingLocationRef = useRef<MapCoordinate | null>(null);
  const busHeadingRef = useRef(0);

  const parent = parentData;

  const child = parent?.children?.find((item: any) => item._id === selectedChildId) || parent?.children?.[0] || null;
  const route = useParentRoute(child?._id);
  const completedPath = useMemo(() => decodeRoute(route.trip?.completedPolyline), [route.trip?.completedPolyline]);
  const bus = child?.busId || null;

  const driver = bus?.driverId || null;

  // ================= FCM SETUP =================
  useEffect(() => {
    const saveFcmToken = async (token: string) => {
      try {
        const authToken = await AsyncStorage.getItem("token");

        if (!authToken || !token) {
          console.log("FCM token save skipped");
          return;
        }

        const response = await fetch(
          `${BASE_URL}/parent/save-fcm-token`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${authToken}`,
            },
            body: JSON.stringify({ token }),
          }
        );

        if (!response.ok) {
          const responseText = await response.text();

          console.log("FCM token save failed:", {
            status: response.status,
            response: responseText,
          });

          return;
        }

        console.log("FCM token sent to backend:", token);
      } catch (err) {
        console.log("FCM token save error:", err);
      }
    };

    const setupFCM = async () => {
      try {
        await messaging().registerDeviceForRemoteMessages();
        await messaging().requestPermission();
        await notifee.requestPermission();

        const token = await messaging().getToken();

        console.log("FCM TOKEN:", token);

        await saveFcmToken(token);
      } catch (err) {
        console.log("FCM setup error:", err);
      }
    };

    setupFCM();

    const unsubscribeForeground = messaging().onMessage(
      async remoteMessage => {
        console.log(
          "FOREGROUND FCM:",
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
      }
    );

    const unsubscribeTokenRefresh = messaging().onTokenRefresh(
      async refreshedToken => {
        console.log("FCM TOKEN REFRESHED:", refreshedToken);
        await saveFcmToken(refreshedToken);
      }
    );

    return () => {
      unsubscribeForeground();
      unsubscribeTokenRefresh();
    };
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
      lastHeadingLocationRef.current = coord;

      const initialTimestamp = loadedBus.lastLocationUpdatedAt
        ? new Date(loadedBus.lastLocationUpdatedAt).getTime()
        : Date.now();

      if (Number.isFinite(initialTimestamp)) {
        lastLocationTimestampRef.current = initialTimestamp;
      }

      setAnimatedLocation(coord);

      // Show the latest saved bus position, but do not draw a
      // route from this stored snapshot.
      hasReceivedFreshLocationRef.current = false;
      setPath([]);

      setTimeout(() => {
        mapRef.current?.animateToRegion({
          latitude: coord.latitude,
          longitude: coord.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        });
      }, 500);
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
  }, [router]);

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

  // ================= BUS DIRECTION =================
  const updateBusHeading = (newCoord: MapCoordinate) => {
    const previousCoord = lastHeadingLocationRef.current;

    if (!previousCoord) {
      lastHeadingLocationRef.current = newCoord;
      return;
    }

    const movementDistance = getDistanceBetweenCoordinates(
      previousCoord,
      newCoord
    );

    // Ignore tiny GPS movements that can make the icon shake.
    if (movementDistance < 5) {
      return;
    }

    const calculatedHeading = getBearingBetweenCoordinates(
      previousCoord,
      newCoord
    );

    const isFirstHeading = busHeadingRef.current === 0;

    const nextHeading = isFirstHeading
      ? calculatedHeading
      : smoothHeading(
          busHeadingRef.current,
          calculatedHeading
        );

    busHeadingRef.current = nextHeading;
    setBusHeading(nextHeading);

    lastHeadingLocationRef.current = newCoord;
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

    updateBusHeading(newCoord);
    moveBusMarker(newCoord);

  };

  // Every route response is scoped to the selected child, including polling fallback.
  useEffect(() => {
    displayedLocationRef.current = null;
    lastLocationTimestampRef.current = 0;
    lastHeadingLocationRef.current = null;
    if (markerAnimationRef.current) clearInterval(markerAnimationRef.current);
    setAnimatedLocation(null); setBusLocation(null); setPath([]); setPickupLocation(null);
    setTripStatus('idle');
  }, [child?._id]);
  useEffect(() => {
    const trip = route.trip;
    if (trip && trip.studentId !== child?._id) return;
    setTripStatus(trip?.status === 'active' ? 'started' : 'idle');
    setPath(decodeRoute(trip?.remainingPolyline));
    if (trip?.currentLocation) processLocationUpdate(trip.currentLocation.lat, trip.currentLocation.lng, trip.lastLocationUpdatedAt);
    const approved = trip?.personal?.approvedStop?.location || route.pickup?.approved?.location;
    setPickupLocation(approved ? mapCoordinate(approved) : null);
    // processLocationUpdate intentionally stays outside the dependency list: it
    // writes refs/state only, and recreating it would replay each socket update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.trip, route.pickup, child?._id]);

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
      searchRequestRef.current?.abort();
    };
  }, []);

  // Google Places accepts session tokens up to 36 characters. This UUID-shaped
  // token is exactly 36 characters and is unique for each search session.
  const createPlaceSessionToken = () =>
    "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
      const random = Math.floor(Math.random() * 16);
      const value = character === "x" ? random : (random & 0x3) | 0x8;
      return value.toString(16);
    });

  const openLocationPicker = () => {
    placeSessionTokenRef.current = createPlaceSessionToken();
    pickupSearchBiasRef.current = pickupLocation || null;
    setTempLocation(pickupLocation || null);
    setSearchQuery("");
    setPlaceSuggestions([]);
    setSearchError("");
    setSelectedAddress("");
    setSelectedPlaceId("");
    setIsPickingLocation(true);
  };

  const closeLocationPicker = () => {
    searchRequestRef.current?.abort();
    setIsSearchingPlaces(false);
    setIsSelectingPlace(false);
    setPlaceSuggestions([]);
    setSearchError("");
    setIsPickingLocation(false);
  };

  useEffect(() => {
    if (!isPickingLocation) return;

    if (skipNextAutocompleteRef.current) {
      skipNextAutocompleteRef.current = false;
      return;
    }

    const query = searchQuery.trim();
    if (query.length < 3) {
      searchRequestRef.current?.abort();
      setPlaceSuggestions([]);
      setSearchError("");
      setIsSearchingPlaces(false);
      return;
    }

    const debounceTimer = setTimeout(async () => {
      searchRequestRef.current?.abort();
      const controller = new AbortController();
      searchRequestRef.current = controller;
      setIsSearchingPlaces(true);
      setSearchError("");

      try {
        const token = await AsyncStorage.getItem("token");
        const biasLocation = pickupSearchBiasRef.current;
        const response = await fetch(`${BASE_URL}/places/autocomplete`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            input: query,
            sessionToken: placeSessionTokenRef.current,
            locationBias: biasLocation
              ? {
                  latitude: biasLocation.latitude,
                  longitude: biasLocation.longitude,
                }
              : undefined,
          }),
          signal: controller.signal,
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data?.message || "Unable to search locations");
        }

        setPlaceSuggestions(data.suggestions || []);
      } catch (error: any) {
        if (error?.name !== "AbortError") {
          setPlaceSuggestions([]);
          setSearchError(error?.message || "Unable to search locations");
        }
      } finally {
        if (searchRequestRef.current === controller) {
          setIsSearchingPlaces(false);
        }
      }
    }, 350);

    return () => clearTimeout(debounceTimer);
  }, [searchQuery, isPickingLocation]);

  const selectPlace = async (suggestion: PlaceSuggestion) => {
    setIsSelectingPlace(true);
    setSearchError("");

    try {
      const token = await AsyncStorage.getItem("token");
      const response = await fetch(
        `${BASE_URL}/places/${encodeURIComponent(suggestion.placeId)}?sessionToken=${encodeURIComponent(
          placeSessionTokenRef.current
        )}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const data = await response.json();
      if (!response.ok || !data?.location) {
        throw new Error(data?.message || "Unable to open this location");
      }

      const coordinate = {
        latitude: data.location.latitude,
        longitude: data.location.longitude,
      };

      setTempLocation(coordinate);
      setSelectedAddress(data.formattedAddress || suggestion.fullText);
      setSelectedPlaceId(data.placeId || suggestion.placeId);
      skipNextAutocompleteRef.current = true;
      setSearchQuery(suggestion.fullText);
      setPlaceSuggestions([]);
      pickerMapRef.current?.animateToRegion(
        { ...coordinate, latitudeDelta: 0.006, longitudeDelta: 0.006 },
        450
      );
      placeSessionTokenRef.current = createPlaceSessionToken();
    } catch (error: any) {
      setSearchError(error?.message || "Unable to open this location");
    } finally {
      setIsSelectingPlace(false);
    }
  };

  // ================= CURRENT LOCATION =================
  const useCurrentLocation = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();

    if (status !== "granted") {
      alert("Permission denied");
      return;
    }

    const location = await Location.getCurrentPositionAsync({});

    const coordinate = {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
    };

    pickupSearchBiasRef.current = coordinate;
    setTempLocation(coordinate);
    setSelectedAddress("Current location");
    setSelectedPlaceId("");
    setPlaceSuggestions([]);
    pickerMapRef.current?.animateToRegion(
      { ...coordinate, latitudeDelta: 0.006, longitudeDelta: 0.006 },
      450
    );
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
                  router.push("/change-password" as any);
                }}
              >
                <Text style={styles.dropdownText}>Change Password</Text>
              </TouchableOpacity>

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
                  socket.disconnect();
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

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
          {(parent?.children || []).map((item: any) => <TouchableOpacity key={item._id} accessibilityRole="button" onPress={() => setSelectedChildId(item._id)} style={{ padding: 12, borderRadius: 10, marginRight: 8, backgroundColor: child?._id === item._id ? '#dbeafe' : '#fff' }}><Text style={{ color: '#1d4ed8', fontWeight: '600' }}>{item.name}</Text><Text>{item.busId?.busNumber || 'No bus assigned'}</Text></TouchableOpacity>)}
        </ScrollView>
        <ParentEtaCard trip={route.trip} pickup={route.pickup} connected={route.connected} error={route.error} onRequest={openLocationPicker} onRefresh={route.refresh} />
        {!child && <View style={styles.infoCard}><Text>Link your child with the student code supplied by the school.</Text><TextInput accessibilityLabel="Student code" placeholder="Student code" value={linkCode} onChangeText={setLinkCode} autoCapitalize="characters" /><TouchableOpacity onPress={async () => { try { await routeRequest('/parent/children', { studentCode: linkCode }); const profile = await routeRequest('/parent/me'); setParentData(profile.parent); } catch (e) { alert(e instanceof Error ? e.message : 'Unable to link child'); } }}><Text>Link child</Text></TouchableOpacity></View>}
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
              rotation={(busHeading + 180) % 360}
              flat
            >
              <Image
                source={require("../assets/bus.png")}
                style={{ width: 40, height: 40 }}
                resizeMode="contain"
              />
            </Marker>
          )}

            {completedPath.length > 0 && <Polyline coordinates={completedPath} strokeWidth={4} strokeColor="#94a3b8" />}
            {route.trip?.schoolLocation && <Marker coordinate={mapCoordinate(route.trip.schoolLocation)} title="School" pinColor="blue" />}
            {route.pickup?.request?.status === 'pending' && <Marker coordinate={mapCoordinate(route.pickup.request.requestedLocation)} title="Requested pickup · awaiting school review" pinColor="orange" />}
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
          onPress={openLocationPicker}
        >
          <Text style={styles.buttonText}>Set Pickup Location</Text>
        </TouchableOpacity>

        <Modal
          visible={isPickingLocation}
          animationType="slide"
          presentationStyle="fullScreen"
          onRequestClose={closeLocationPicker}
        >
          <SafeAreaView style={styles.locationPicker} edges={["top", "bottom"]}>
            <KeyboardAvoidingView
              style={styles.locationPicker}
              behavior={Platform.OS === "ios" ? "padding" : undefined}
            >
            <View style={styles.locationMapContainer}>
            <MapView
              provider="google"
              ref={pickerMapRef}
              style={StyleSheet.absoluteFillObject}
              initialRegion={{
                latitude: pickupLocation?.latitude || 26.1573,
                longitude: pickupLocation?.longitude || 91.8173,
                latitudeDelta: 0.01,
                longitudeDelta: 0.01,
              }}
              onPress={(e) => {
                pickupSearchBiasRef.current = e.nativeEvent.coordinate;
                setTempLocation(e.nativeEvent.coordinate);
                setSelectedAddress("");
    setSelectedPlaceId("");
                setPlaceSuggestions([]);
              }}
            >
              {tempLocation && (
                <Marker coordinate={tempLocation} pinColor="green" />
              )}
            </MapView>

            <View style={styles.searchArea}>
              <View style={styles.searchBox}>
                <Ionicons name="search" size={21} color="#64748b" />
                <TextInput
                  style={styles.searchInput}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="Search area, street or landmark"
                  placeholderTextColor="#94a3b8"
                  autoCorrect={false}
                  returnKeyType="search"
                />
                {(isSearchingPlaces || isSelectingPlace) && (
                  <ActivityIndicator size="small" color="#2563eb" />
                )}
                {!!searchQuery && !isSearchingPlaces && !isSelectingPlace && (
                  <TouchableOpacity
                    accessibilityLabel="Clear location search"
                    onPress={() => {
                      setSearchQuery("");
                      setPlaceSuggestions([]);
                      setSearchError("");
                    }}
                  >
                    <Ionicons name="close-circle" size={21} color="#94a3b8" />
                  </TouchableOpacity>
                )}
              </View>

              {(placeSuggestions.length > 0 || searchError) && (
                <View style={styles.searchResults}>
                  {!!searchError && (
                    <Text style={styles.searchError}>{searchError}</Text>
                  )}
                  {placeSuggestions.map((suggestion, index) => (
                    <TouchableOpacity
                      key={suggestion.placeId}
                      style={[
                        styles.suggestionRow,
                        index < placeSuggestions.length - 1 &&
                          styles.suggestionDivider,
                      ]}
                      onPress={() => selectPlace(suggestion)}
                    >
                      <View style={styles.suggestionIcon}>
                        <Ionicons name="location-outline" size={20} color="#2563eb" />
                      </View>
                      <View style={styles.suggestionTextWrap}>
                        <Text style={styles.suggestionTitle} numberOfLines={1}>
                          {suggestion.mainText}
                        </Text>
                        {!!suggestion.secondaryText && (
                          <Text style={styles.suggestionSubtitle} numberOfLines={2}>
                            {suggestion.secondaryText}
                          </Text>
                        )}
                      </View>
                    </TouchableOpacity>
                  ))}
                  <Text style={styles.googleAttribution}>Powered by Google</Text>
                </View>
              )}
            </View>

            <TouchableOpacity
              style={styles.useCurrentBtn}
              onPress={useCurrentLocation}
            >
              <Text style={{ color: "#fff" }}>Use Current Location</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={closeLocationPicker}
            >
              <Text style={{ color: "#fff", fontWeight: "600" }}>Cancel</Text>
            </TouchableOpacity>
            </View>

            <View style={styles.locationFooter}>
              <Text style={styles.locationHint}>
                {selectedAddress || "Search above or tap the map to place the pickup marker."}
              </Text>
              <TouchableOpacity
              style={[styles.confirmBtn, !tempLocation && styles.confirmBtnDisabled]}
              disabled={!tempLocation || submittingPickup || !child}
              onPress={async () => {
                if (!tempLocation || !child || submittingPickup) return;
                setSubmittingPickup(true);
                try {
                  await routeRequest(`/parent/pickup-request/${child._id}`, { requestedLocation: { lat: tempLocation.latitude, lng: tempLocation.longitude }, formattedAddress: selectedAddress, placeId: selectedPlaceId });
                  await route.refresh(); closeLocationPicker();
                  alert('Pending school review. Your current approved pickup point remains unchanged.');
                } catch (e) { setSearchError(e instanceof Error ? e.message : 'Unable to submit pickup location'); }
                finally { setSubmittingPickup(false); }
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "bold" }}>
                {submittingPickup ? 'Submitting…' : 'Submit for school review'}
              </Text>
            </TouchableOpacity>
            </View>
            </KeyboardAvoidingView>
          </SafeAreaView>
        </Modal>

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
  locationPicker: {
    flex: 1,
    backgroundColor: "#fff",
  },
  locationMapContainer: {
    flex: 1,
    minHeight: 0,
  },
  searchArea: {
    position: "absolute",
    top: 16,
    left: 16,
    right: 16,
    zIndex: 20,
  },
  searchBox: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    backgroundColor: "#ffffff",
    borderRadius: 16,
    elevation: 8,
    shadowColor: "#0f172a",
    shadowOpacity: 0.14,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  searchInput: {
    flex: 1,
    color: "#0f172a",
    fontSize: 16,
    paddingVertical: 13,
  },
  searchResults: {
    marginTop: 8,
    maxHeight: 310,
    overflow: "hidden",
    backgroundColor: "#ffffff",
    borderRadius: 16,
    elevation: 8,
    shadowColor: "#0f172a",
    shadowOpacity: 0.14,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  suggestionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  suggestionDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e2e8f0",
  },
  suggestionIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#eff6ff",
    marginRight: 12,
  },
  suggestionTextWrap: {
    flex: 1,
  },
  suggestionTitle: {
    color: "#0f172a",
    fontSize: 15,
    fontWeight: "700",
  },
  suggestionSubtitle: {
    color: "#64748b",
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  searchError: {
    color: "#b91c1c",
    fontSize: 13,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  googleAttribution: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "600",
    textAlign: "right",
    paddingHorizontal: 14,
    paddingTop: 7,
    paddingBottom: 9,
  },
  useCurrentBtn: {
    position: "absolute",
    top: 82,
    left: 16,
    backgroundColor: "#2563eb",
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 10,
    elevation: 4,
  },
  locationFooter: {
    backgroundColor: "#ffffff",
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#d1d5db",
    elevation: 10,
  },
  locationHint: {
    color: "#4b5563",
    fontSize: 13,
    textAlign: "center",
    marginBottom: 9,
  },
  confirmBtn: {
    backgroundColor: "#2563eb",
    minHeight: 52,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  confirmBtnDisabled: {
    backgroundColor: "#93b4f5",
  },
  cancelBtn: {
    position: "absolute",
    top: 82,
    right: 16,
    backgroundColor: "#ef4444",
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 10,
    elevation: 4,
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
