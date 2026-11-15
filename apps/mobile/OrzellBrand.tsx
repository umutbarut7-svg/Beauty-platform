import { Image, StyleSheet, Text, View } from "react-native";

// Show only the original emblem through a viewport. The JPEG bytes are unchanged.
const scale = 64 / 590;

export function OrzellBrand({ compact = false }: { compact?: boolean }) {
  return (
    <View
      style={[styles.band, compact && styles.compactBand]}
      accessible
      accessibilityRole="image"
      accessibilityLabel="ORZELL"
    >
      <View style={[styles.wordmark, compact && styles.compactWordmark]}>
        <View style={styles.emblem}>
          <Image
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            source={require("./assets/orzell-original-reference.jpg")}
            accessible={false}
            resizeMode="stretch"
            style={styles.reference}
          />
        </View>
        <Text style={styles.letters} allowFontScaling={false}>
          RZELL
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  compactBand: {
    padding: 0,
    height: 44,
    width: 158,
    justifyContent: "center",
    overflow: "hidden",
  },
  compactWordmark: { transform: [{ scale: 0.64 }] },
  band: {
    backgroundColor: "#000000",
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  wordmark: { flexDirection: "row", alignItems: "center" },
  emblem: { width: 64, height: 510 * scale, overflow: "hidden" },
  reference: {
    position: "absolute",
    width: 1254 * scale,
    height: 1254 * scale,
    left: -340 * scale,
    top: -65 * scale,
  },
  letters: {
    color: "#d8b4ec",
    fontSize: 30,
    letterSpacing: 4,
    fontWeight: "300",
    marginLeft: 4,
  },
});
