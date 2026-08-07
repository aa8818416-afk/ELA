-- Migration: pests_diseases table & seed data

CREATE TABLE public.pests_diseases (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name_ar      text        NOT NULL,
  category     text,       -- آفة / مرض فطري / مرض بكتيري / فيروسي / إلخ
  common_crops text[],     -- المحاصيل المستهدفة
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pests_diseases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone_read_pests_diseases" ON public.pests_diseases
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "admin_manage_pests_diseases" ON public.pests_diseases
  FOR ALL USING (public.get_my_role() = 'admin');

-- Seed Data for Common Egyptian Crop Pests & Diseases
INSERT INTO public.pests_diseases (name_ar, category, common_crops) VALUES
('الندوة التأخرة (البياض الزغبي)', 'مرض فطري', ARRAY['بطاطس', 'طماطم']),
('الندوة المبكرة', 'مرض فطري', ARRAY['بطاطس', 'طماطم']),
('البياض الدقيقي', 'مرض فطري', ARRAY['عنب', 'خيار', 'كوسة', 'فلفل', 'قمح']),
('العفن الرمادي (البوتريتس)', 'مرض فطري', ARRAY['عنب', 'فراولة', 'طماطم']),
('صدأ القمح', 'مرض فطري', ARRAY['قمح']),
('تفحم القمح', 'مرض فطري', ARRAY['قمح']),
('حفار أنفاق الطماطم (توتا أبسولوتا)', 'آفة حشرية', ARRAY['طماطم', 'بطاطس']),
('دودة ورق القطن', 'آفة حشرية', ARRAY['قطن', 'طماطم', 'ذرة', 'بطاطس', 'خضروات']),
('حشرة المن (الندوة العسلية)', 'آفة حشرية', ARRAY['قمح', 'بطاطس', 'بصل', 'خيار', 'موالح']),
('التربس', 'آفة حشرية', ARRAY['بصل', 'ثوم', 'فلفل', 'فراولة', 'قطن']),
('العنكبوت الأحمر (الأكاروس)', 'آفة حشرية', ARRAY['فراولة', 'خيار', 'قطن', 'باذنجان', 'موالح']),
('ذباب الفاكهة (ذباب خوص المانجو/الموالح)', 'آفة حشرية', ARRAY['مانجو', 'موالح', 'عنب']),
('العفن الأسود / البياض الدقيقي في العنب', 'مرض فطري', ARRAY['عنب']),
('عفن الجذور والتسمغ', 'مرض فطري', ARRAY['موالح', 'خيار', 'طماطم']),
('مرض ذبول الفيوزاريوم', 'مرض فطري', ARRAY['طماطم', 'خيار', 'بصل', 'قطن']),
('عفن البصل التفحمي / التبقع الأرجواني', 'مرض فطري', ARRAY['بصل', 'ثوم']),
('دودة الحشد الخديوية / الخريفية', 'آفة حشرية', ARRAY['ذرة', 'قصب السكر']),
('نيماتودا تعقد الجذور', 'آفة آفتية (نيماتودا)', ARRAY['بطاطس', 'طماطم', 'خيار', 'عنب', 'موز']);
