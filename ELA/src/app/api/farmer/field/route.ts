import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
    }

    const body = await req.json();
    const {
      field_name,
      crop_type,
      planting_date,
      area_feddan,
      governorate,
      center,
      soil_type,
      irrigation_type,
      fieldId, // If editing existing field
    } = body;

    if (!crop_type) {
      return NextResponse.json({ error: 'يرجى إدخال نوع المحصول' }, { status: 400 });
    }

    if (fieldId) {
      // Update existing field
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('farmer_fields')
        .update({
          field_name: field_name || `حقل ${crop_type}`,
          crop_type,
          planting_date: planting_date || new Date().toISOString().split('T')[0],
          area_feddan: area_feddan ? Number(area_feddan) : 1,
          governorate: governorate || null,
          center: center || null,
          soil_type: soil_type || null,
          irrigation_type: irrigation_type || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', fieldId)
        .eq('farmer_id', user.id)
        .select()
        .single();

      if (error) throw error;
      return NextResponse.json({ success: true, field: data, action: 'UPDATE' });
    } else {
      // Insert new field
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('farmer_fields')
        .insert({
          farmer_id: user.id,
          field_name: field_name || `حقل ${crop_type}`,
          crop_type,
          planting_date: planting_date || new Date().toISOString().split('T')[0],
          area_feddan: area_feddan ? Number(area_feddan) : 1,
          governorate: governorate || null,
          center: center || null,
          soil_type: soil_type || null,
          irrigation_type: irrigation_type || null,
          is_active: true,
          notifications_enabled: true,
        })
        .select()
        .single();

      if (error) throw error;
      return NextResponse.json({ success: true, field: data, action: 'CREATE' });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'حدث خطأ في الحفظ';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
