import { AppText as Text, palette } from "./ui";
import { useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import type { MvpApiClient } from "@beauty-platform/types";
type Named = { id: string; name: string };
type Professional = { id: string; displayName: string };
type Hour = {
  dayOfWeek: string;
  isOpen: boolean;
  openTime?: string;
  closeTime?: string;
};
const days = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
];
export function BusinessSetup({
  api,
  businessId,
  busy,
  run,
}: {
  api: MvpApiClient;
  businessId: string;
  busy: boolean;
  run: (action: () => Promise<void>) => Promise<void>;
}) {
  const [locations, setLocations] = useState<Named[]>([]);
  const [categories, setCategories] = useState<Named[]>([]);
  const [staff, setStaff] = useState<Professional[]>([]);
  const [services, setServices] = useState<
    Array<Named & { price: string; currency: string }>
  >([]);
  const [locationId, setLocationId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [staffId, setStaffId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [locationName, setLocationName] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [serviceName, setServiceName] = useState("");
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState("");
  const [duration, setDuration] = useState("");
  const [hours, setHours] = useState<Hour[]>([]);
  const [staffHours, setStaffHours] = useState<
    Array<{
      dayOfWeek: string;
      startTime: string;
      endTime: string;
      isActive: boolean;
    }>
  >([]);
  const [day, setDay] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [message, setMessage] = useState("");
  const [memberEmail, setMemberEmail] = useState("");
  const [members, setMembers] = useState<
    Array<{ id: string; role: string; user: { id: string; email: string } }>
  >([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const path = `/businesses/${businessId}`;
  const field = (label: string, value: string, change: (x: string) => void) => (
    <TextInput
      placeholderTextColor={palette.muted}
      accessibilityLabel={label}
      placeholder={label}
      value={value}
      onChangeText={change}
      editable={!busy}
      style={styles.input}
      maxLength={300}
    />
  );
  const button = (label: string, action: () => Promise<void>) => (
    <Pressable
      key={label}
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={busy}
      style={styles.button}
      onPress={() => void run(action)}
    >
      <Text style={styles.white}>{label}</Text>
    </Pressable>
  );
  async function load() {
    const [l, c, p, s] = await Promise.all([
      api.request<Named[]>(`${path}/locations`),
      api.request<Named[]>(`${path}/service-categories`),
      api.request<Professional[]>(`${path}/staff`),
      api.request<Array<Named & { price: string; currency: string }>>(
        `${path}/services`,
      ),
    ]);
    setLocations(l);
    setCategories(c);
    setStaff(p);
    setServices(s);
    setMessage("İşletme kayıtları yüklendi.");
  }
  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Profesyoneller, hizmetler ve uygunluk</Text>
      {message && <Text accessibilityRole="alert">{message}</Text>}
      {button("Yönetim kayıtlarını yükle", load)}
      <Text style={styles.heading}>Konum</Text>
      {locations.map((l) =>
        button(`${l.name}${l.id === locationId ? " ✓" : ""}`, async () => {
          setLocationId(l.id);
        }),
      )}
      {field("Konum adı", locationName, setLocationName)}
      {field("Adres", address, setAddress)}
      {field("Şehir", city, setCity)}
      {button("Konum ekle", async () => {
        const l = await api.request<Named>(`${path}/locations`, "POST", {
          name: locationName,
          address,
          city,
        });
        setLocationId(l.id);
        await load();
      })}
      <Text style={styles.heading}>Profesyonel</Text>
      <Text>
        Profesyonel hesabı önceden kayıtlı olmalıdır. Üyelik vermek profil
        bağlamakla aynı işlem değildir.
      </Text>
      {field("Profesyonel hesap e-postası", memberEmail, setMemberEmail)}
      {button("Kayıtlı hesaba profesyonel üyeliği ver", async () => {
        await api.request(`${path}/members`, "POST", {
          email: memberEmail,
          role: "STAFF",
        });
        setMembers(await api.request(`${path}/members`));
        setMessage("Profesyonel üyeliği oluşturuldu.");
      })}
      {button("İşletme üyelerini yükle", async () => {
        setMembers(await api.request(`${path}/members`));
      })}
      {members
        .filter((m) => m.role === "STAFF")
        .map((m) =>
          button(
            `${m.user.email}${selectedUserId === m.user.id ? " ✓" : ""}`,
            async () => {
              setSelectedUserId(m.user.id);
            },
          ),
        )}
      {staffId &&
        selectedUserId &&
        button("Seçilen profesyoneli hesaba bağla", async () => {
          await api.request(`${path}/staff/${staffId}`, "PATCH", {
            userId: selectedUserId,
          });
          setMessage("Profesyonel profili seçilen üyeye bağlandı.");
        })}

      {staff.map((p) =>
        button(`${p.displayName}${p.id === staffId ? " ✓" : ""}`, async () => {
          setStaffId(p.id);
          setStaffHours([]);
        }),
      )}
      {field("Ad", firstName, setFirstName)}
      {field("Soyad", lastName, setLastName)}
      {field("Görünen ad", displayName, setDisplayName)}
      {button("Profesyonel ekle", async () => {
        const p = await api.request<Professional>(`${path}/staff`, "POST", {
          firstName,
          lastName,
          displayName,
          ...(locationId ? { locationIds: [locationId] } : {}),
        });
        setStaffId(p.id);
        await load();
      })}
      <Text style={styles.heading}>Kategori ve hizmet</Text>
      {categories.map((c) =>
        button(`${c.name}${c.id === categoryId ? " ✓" : ""}`, async () => {
          setCategoryId(c.id);
        }),
      )}
      {field("Kategori adı", categoryName, setCategoryName)}
      {button("Kategori ekle", async () => {
        const c = await api.request<Named>(
          `${path}/service-categories`,
          "POST",
          { name: categoryName },
        );
        setCategoryId(c.id);
        await load();
      })}
      {services.map((s) =>
        button(
          `${s.name} · ${s.price} ${s.currency}${s.id === serviceId ? " ✓" : ""}`,
          async () => {
            setServiceId(s.id);
            setServiceName(s.name);
            setPrice(s.price);
            setCurrency(s.currency);
          },
        ),
      )}
      {field("Hizmet adı", serviceName, setServiceName)}
      {field("Fiyat (ondalık metin)", price, setPrice)}
      {field("Para birimi", currency, setCurrency)}
      {field("Süre (dakika)", duration, setDuration)}
      {button("Hizmet ekle", async () => {
        const s = await api.request<Named>(`${path}/services`, "POST", {
          categoryId,
          name: serviceName,
          price,
          currency,
          durationMinutes: Number(duration),
        });
        setServiceId(s.id);
        await load();
      })}
      {serviceId &&
        button("Hizmet fiyatını kaydet", async () => {
          await api.request(`${path}/services/${serviceId}`, "PATCH", {
            price,
            currency,
          });
          await load();
        })}
      {staffId &&
        serviceId &&
        button("Hizmeti seçilen profesyonele ata", async () => {
          await api.request(
            `${path}/staff/${staffId}/services/${serviceId}`,
            "POST",
            {},
          );
          setMessage("Hizmet ataması kaydedildi.");
        })}
      <Text style={styles.heading}>Çalışma saatleri</Text>
      <Text>
        Günü ve saatleri açıkça seçin. Diğer günlerin kayıtları korunur.
      </Text>
      {days.map((d) =>
        button(`${d}${d === day ? " ✓" : ""}`, async () => {
          setDay(d);
        }),
      )}
      {field("Başlangıç (HH:mm)", start, setStart)}
      {field("Bitiş (HH:mm)", end, setEnd)}
      {button("İşletme saatlerini yükle", async () => {
        setHours(await api.request<Hour[]>(`${path}/working-hours`));
        setMessage("Saatler yüklendi; kaydetmeden önce kontrol edin.");
      })}
      {hours.map((h) => (
        <Text key={h.dayOfWeek}>
          {h.dayOfWeek}: {h.isOpen ? `${h.openTime}–${h.closeTime}` : "Kapalı"}
        </Text>
      ))}
      {hours.length > 0 &&
        button("Seçilen işletme gününü kaydet", async () => {
          if (!day) {
            setMessage("Bir gün seçin.");
            return;
          }
          const next = hours.map((h) =>
            h.dayOfWeek === day
              ? {
                  dayOfWeek: day,
                  isOpen: true,
                  openTime: start,
                  closeTime: end,
                }
              : {
                  dayOfWeek: h.dayOfWeek,
                  isOpen: h.isOpen,
                  ...(h.isOpen
                    ? { openTime: h.openTime, closeTime: h.closeTime }
                    : {}),
                },
          );
          await api.request(`${path}/working-hours`, "PUT", { hours: next });
          setHours(next);
          setMessage("İşletme saatleri kaydedildi.");
        })}
      {staffId && (
        <>
          {button("Profesyonel saatlerini yükle", async () => {
            const values = await api.request<
              Array<{
                dayOfWeek: string;
                startTime: string;
                endTime: string;
                isActive: boolean;
              }>
            >(`${path}/staff/${staffId}/working-hours`);
            setStaffHours(values);
            setMessage(
              values.length
                ? "Profesyonel saatleri yüklendi."
                : "Kayıtlı profesyonel saati yok.",
            );
          })}
          {staffHours.map((h, i) => (
            <Text key={i}>
              {h.dayOfWeek}: {h.startTime}–{h.endTime}
            </Text>
          ))}
          {button("Seçilen profesyonel gününü kaydet", async () => {
            if (!day) {
              setMessage("Bir gün seçin.");
              return;
            }
            const current = await api.request<
              Array<{
                dayOfWeek: string;
                startTime: string;
                endTime: string;
                isActive: boolean;
              }>
            >(`${path}/staff/${staffId}/working-hours`);
            const next = [
              ...current
                .filter((h) => h.dayOfWeek !== day)
                .map((h) => ({
                  dayOfWeek: h.dayOfWeek,
                  startTime: h.startTime,
                  endTime: h.endTime,
                  isActive: h.isActive,
                })),
              {
                dayOfWeek: day,
                startTime: start,
                endTime: end,
                isActive: true,
              },
            ];
            await api.request(`${path}/staff/${staffId}/working-hours`, "PUT", {
              hours: next,
            });
            setStaffHours(next);
            setMessage("Profesyonel saatleri kaydedildi.");
          })}
        </>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  container: { gap: 12 },
  heading: {
    fontSize: 18,
    fontWeight: "600",
    marginTop: 16,
    color: palette.text,
  },
  input: {
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 10,
    padding: 14,
    backgroundColor: palette.field,
    color: palette.text,
    minHeight: 48,
  },
  button: {
    padding: 12,
    backgroundColor: palette.primary,
    borderRadius: 8,
    marginVertical: 3,
  },
  white: { color: "white" },
});
