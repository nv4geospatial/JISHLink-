import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, Platform, Image } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import colors from "@/constants/colors";

interface NavHeaderProps {
  title: string;
  showBack?: boolean;
  rightIcon?: React.ReactNode;
  onRightPress?: () => void;
  notificationCount?: number;
}

export function NavHeader({ title, showBack, rightIcon, onRightPress, notificationCount }: NavHeaderProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const c = colors.light;

  const topPad = Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top;

  return (
    <View style={[styles.header, { backgroundColor: c.navy, paddingTop: topPad + 12 }]}>
      <View style={styles.row}>
        {showBack ? (
          <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
            <Feather name="chevron-left" size={24} color={c.white} />
          </TouchableOpacity>
        ) : (
          <Image source={require("@/assets/images/logo-icon.jpeg")} style={styles.logoSmall} resizeMode="contain" />
        )}

        <Text style={[styles.title, { color: c.white, fontFamily: "Poppins_700Bold" }]} numberOfLines={1}>
          {title}
        </Text>

        {rightIcon ? (
          <TouchableOpacity onPress={onRightPress} style={styles.iconBtn}>
            {rightIcon}
            {notificationCount ? (
              <View style={[styles.badge, { backgroundColor: c.gold }]}>
                <Text style={[styles.badgeText, { color: c.navy }]}>{notificationCount > 9 ? "9+" : notificationCount}</Text>
              </View>
            ) : null}
          </TouchableOpacity>
        ) : (
          <View style={styles.iconBtn} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 16,
    paddingBottom: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  row: { flexDirection: "row", alignItems: "center" },
  title: { flex: 1, fontSize: 18, marginHorizontal: 8 },
  iconBtn: { width: 36, height: 36, justifyContent: "center", alignItems: "center" },
  logoSmall: { width: 32, height: 32 },
  badge: {
    position: "absolute",
    top: -2,
    right: -2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 3,
  },
  badgeText: { fontSize: 9, fontFamily: "Inter_700Bold" },
});
