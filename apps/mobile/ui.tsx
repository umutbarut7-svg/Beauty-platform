import { Text as NativeText, Platform, type TextProps } from "react-native";

export const palette = {
  background: "#0b0910",
  surface: "#17121f",
  raised: "#231b30",
  field: "#100d16",
  border: "#3a2e49",
  text: "#f5efff",
  muted: "#b2a6c2",
  primary: "#7851a9",
  lavender: "#d8b4ec",
};

export function AppText({ style, ...props }: TextProps) {
  return (
    <NativeText
      {...props}
      style={[
        {
          color: palette.text,
          fontFamily:
            Platform.OS === "web"
              ? "system-ui"
              : Platform.OS === "ios"
                ? "System"
                : "sans-serif",
        },
        style,
      ]}
    />
  );
}

export * from "./presentation";
