import { SafeAreaView, StyleSheet, Text, View } from "react-native";

export default function App() {
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.content}>
        <Text style={styles.eyebrow}>BEAUTY PLATFORM</Text>
        <Text style={styles.title}>Mobil altyapı hazır.</Text>
        <Text style={styles.body}>
          Expo ve TypeScript geliştirme ortamı çalışıyor.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#faf7f8" },
  content: { flex: 1, justifyContent: "center", padding: 32 },
  eyebrow: {
    color: "#9a4964",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 2,
  },
  title: {
    color: "#271f22",
    fontSize: 40,
    fontWeight: "700",
    marginVertical: 12,
  },
  body: { color: "#695c61", fontSize: 17, lineHeight: 26 },
});
