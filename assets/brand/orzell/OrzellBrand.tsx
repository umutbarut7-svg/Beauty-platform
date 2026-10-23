import { Image, StyleSheet, Text, View } from "react-native";

// Show only the original emblem through a viewport. The JPEG bytes are unchanged.
const scale = 64 / 590;

export function OrzellBrand() {
  return (
    <View
      style={styles.band}
      accessible
      accessibilityRole="image"
      accessibilityLabel="ORZELL ön izleme"
    >
      <View style={styles.wordmark}>
        <View style={styles.emblem}>
          <Image
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
      <Text style={styles.preview}>ÖN İZLEME</Text>
    </View>
  );
}

const styles = StyleSheet.create({
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
  preview: { color: "#d8b4ec", fontSize: 10, letterSpacing: 2, marginTop: 8 },
});
