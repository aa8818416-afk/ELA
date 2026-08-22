import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import FarmerAgendaClient from "@/components/agenda/FarmerAgendaClient";

export const dynamic = "force-dynamic";

export default async function FarmerAgendaPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Fetch farmer's active fields
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: farmerFields } = await (supabase as any)
    .from("farmer_fields")
    .select(`
      id,
      field_name,
      crop_type,
      planting_date,
      area_feddan,
      is_active,
      notifications_enabled
    `)
    .eq("farmer_id", user.id)
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  const farmerFieldsList = farmerFields || [];
  const fieldIds = farmerFieldsList.map((f: { id: string }) => f.id);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let openAlerts: any[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let todayLogs: any[] = [];

  if (fieldIds.length > 0) {
    const todayCairo = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Cairo",
    }).format(new Date());

    const [alertsRes, logsRes] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from("alert_instances")
        .select("*")
        .in("farmer_field_id", fieldIds)
        .not(
          "status",
          "in",
          '("CLOSED_FALSE_ALARM","AUTO_CLOSED_NO_RESPONSE","RESOLVED","CROP_LOSS","CLOSED_SEASON_END","MISDIAGNOSED_ORIGINAL")'
        )
        .order("severity_snapshot", { ascending: true })
        .order("created_at", { ascending: true }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from("daily_agenda_log")
        .select(`
          id,
          farmer_field_id,
          date,
          quality_tip_id,
          crop_quality_tips (
            id,
            tip_text,
            tip_reason,
            crop_type,
            stage_from_day,
            stage_to_day,
            rotation_order
          )
        `)
        .in("farmer_field_id", fieldIds)
        .eq("date", todayCairo),
    ]);

    openAlerts = alertsRes.data || [];
    todayLogs = logsRes.data || [];
  }

  return (
    <div className="space-y-6">
      <div className="pt-2 pb-2">
        <h1 className="text-2xl font-bold text-white mb-1">أجندتي اليومية</h1>
        <p className="text-slate-400 text-sm">
          {new Intl.DateTimeFormat("ar-EG", {
            timeZone: "Africa/Cairo",
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
          }).format(new Date())}
        </p>
      </div>

      <FarmerAgendaClient
        fields={farmerFieldsList}
        openAlerts={openAlerts}
        todayLogs={todayLogs}
      />
    </div>
  );
}
