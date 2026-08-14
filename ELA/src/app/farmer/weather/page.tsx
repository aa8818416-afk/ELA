import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import FarmerWeatherClient from "@/components/farmer/FarmerWeatherClient";
import { EGYPT_CENTERS_COORDINATES } from "@/data/egyptCenters";
import { getOrFetchCenterWeather } from "@/lib/weatherLogic";

export const dynamic = "force-dynamic";

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default async function FarmerWeatherPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // 1. Fetch farmer active fields
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: farmerFields } = await (supabase as any)
    .from("farmer_fields")
    .select("id, field_name, crop_type, latitude, longitude, governorate, center")
    .eq("farmer_id", user.id)
    .eq("is_active", true)
    .limit(5);

  const hasFields = farmerFields && farmerFields.length > 0;

  // 2. Fetch latest open alert if any
  let latestAlert: { id: string; advice_text_snapshot: string } | null = null;
  if (hasFields) {
    const fieldIds = farmerFields.map((f: { id: string }) => f.id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: alertData } = await (supabase as any)
      .from("alert_instances")
      .select("id, advice_text_snapshot")
      .in("farmer_field_id", fieldIds)
      .not(
        "status",
        "in",
        '("CLOSED_FALSE_ALARM","AUTO_CLOSED_NO_RESPONSE","RESOLVED","CROP_LOSS","CLOSED_SEASON_END","MISDIAGNOSED_ORIGINAL")'
      )
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (alertData) {
      latestAlert = alertData;
    }
  }

  // 3. Find weather coordinates and get or fetch 7-day 24h data
  const fieldLat = farmerFields?.[0]?.latitude ?? 30.0444;
  const fieldLon = farmerFields?.[0]?.longitude ?? 31.2357;

  const nearestCenter = EGYPT_CENTERS_COORDINATES.reduce(
    (best, c) => {
      const d = haversineKm(fieldLat, fieldLon, c.lat, c.lng);
      return d < best.dist ? { center: c, dist: d } : best;
    },
    { center: EGYPT_CENTERS_COORDINATES[0], dist: Infinity }
  ).center;

  const weatherData = await getOrFetchCenterWeather(nearestCenter, supabase);
  const currentCrop = farmerFields?.[0]?.crop_type || undefined;

  return (
    <FarmerWeatherClient
      weather={weatherData}
      cropType={currentCrop}
      latestAlert={latestAlert}
    />
  );
}
