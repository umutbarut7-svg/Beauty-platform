import { Pressable, StyleSheet, View } from "react-native";
import { AppText as Text, formatPrice, palette } from "./ui";

type Service = {
  name: string;
  price: string;
  currency: string;
  durationMinutes?: number;
};

// Presentation only: these marks never determine booking or AI compatibility.
function ServiceMark({ name }: { name: string }) {
  const normalized = name.toLocaleLowerCase("tr-TR");
  const extension = /kaynak|uzatma|extension/.test(normalized);
  const cut = !extension && /kesim|kesme|cut/.test(normalized);
  const color = /boya|renk|balayaj|ombre|röfle|balyaj|color/.test(normalized);
  const styling = /fön|fon|şekil|sekil|topuz|maşa|masa|styling/.test(
    normalized,
  );
  const care = /bakım|bakim|keratin|botoks|care/.test(normalized);
  return (
    <View
      style={styles.mark}
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {extension || styling ? (
        <View style={styles.drawing}>
          {[0, 1, 2].map((index) => (
            <View
              key={index}
              style={[
                styles.strand,
                { left: 4 + index * 8 },
                styling && styles.wave,
              ]}
            />
          ))}
        </View>
      ) : cut ? (
        <View style={styles.drawing}>
          <View style={[styles.ring, { left: 2 }]} />
          <View style={[styles.ring, { left: 20 }]} />
          <View style={[styles.blade, { transform: [{ rotate: "35deg" }] }]} />
          <View style={[styles.blade, { transform: [{ rotate: "-35deg" }] }]} />
        </View>
      ) : color ? (
        <View style={styles.swatches}>
          <View style={[styles.swatch, { backgroundColor: palette.primary }]} />
          <View
            style={[styles.swatch, { backgroundColor: palette.lavender }]}
          />
          <View style={[styles.swatch, { backgroundColor: palette.text }]} />
        </View>
      ) : care ? (
        <View style={styles.drop} />
      ) : (
        <View style={styles.diamond} />
      )}
    </View>
  );
}

/** Shared catalog/management choice, with a wrapping price row for narrow screens. */
export function ServiceChoice({
  service,
  selected,
  disabled,
  label,
  onPress,
}: {
  service: Service;
  selected: boolean;
  disabled: boolean;
  label: string;
  onPress: () => void;
}) {
  const price = formatPrice(service.price, service.currency);
  const duration =
    typeof service.durationMinutes === "number" &&
    Number.isFinite(service.durationMinutes) &&
    service.durationMinutes > 0
      ? `${service.durationMinutes} dakika`
      : "";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={[duration, price].filter(Boolean).join(" · ")}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.card,
        selected && styles.selected,
        disabled && styles.disabled,
      ]}
    >
      <View style={styles.top}>
        <ServiceMark name={service.name} />
        <Text style={styles.name}>{service.name}</Text>
        {selected && <Text style={styles.check}>✓</Text>}
      </View>
      <View style={styles.details}>
        {!!duration && <Text style={styles.duration}>{duration}</Text>}
        <Text style={styles.price}>{price}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
    borderRadius: 18,
    gap: 14,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.field,
    minWidth: 0,
  },
  selected: { borderColor: palette.lavender, backgroundColor: palette.raised },
  disabled: { opacity: 0.5 },
  top: { flexDirection: "row", alignItems: "center", gap: 12 },
  name: {
    flex: 1,
    minWidth: 0,
    fontSize: 16,
    lineHeight: 23,
    fontWeight: "600",
  },
  check: { color: palette.lavender, fontSize: 18 },
  details: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    columnGap: 16,
    rowGap: 6,
  },
  duration: { color: palette.muted, fontSize: 13, lineHeight: 21 },
  price: {
    color: palette.lavender,
    fontSize: 17,
    lineHeight: 25,
    fontWeight: "600",
    flexShrink: 1,
  },
  mark: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: palette.raised,
    alignItems: "center",
    justifyContent: "center",
  },
  drawing: { width: 32, height: 32 },
  strand: {
    position: "absolute",
    top: 3,
    width: 6,
    height: 26,
    borderLeftWidth: 2,
    borderColor: palette.lavender,
    borderRadius: 4,
  },
  wave: { width: 9, borderRightWidth: 1, transform: [{ rotate: "18deg" }] },
  ring: {
    position: "absolute",
    top: 21,
    width: 10,
    height: 10,
    borderWidth: 2,
    borderColor: palette.lavender,
    borderRadius: 5,
  },
  blade: {
    position: "absolute",
    left: 15,
    top: 0,
    height: 29,
    width: 2,
    backgroundColor: palette.lavender,
  },
  swatches: { flexDirection: "row", gap: 3, transform: [{ rotate: "-20deg" }] },
  swatch: { width: 7, height: 24, borderRadius: 4 },
  drop: {
    width: 21,
    height: 26,
    borderWidth: 2,
    borderColor: palette.lavender,
    borderTopLeftRadius: 2,
    borderTopRightRadius: 14,
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
    transform: [{ rotate: "45deg" }],
  },
  diamond: {
    width: 19,
    height: 19,
    borderWidth: 2,
    borderColor: palette.lavender,
    borderRadius: 4,
    transform: [{ rotate: "45deg" }],
  },
});
