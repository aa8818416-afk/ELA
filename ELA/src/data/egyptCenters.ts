/**
 * قائمة شاملة بمحافظات ومراكز مصر وإحداثياتها الجغرافية
 */

export interface CenterCoordinates {
  governorate: string;
  center: string;
  lat: number;
  lng: number;
}

export const EGYPT_CENTERS_COORDINATES: CenterCoordinates[] = [
  // 1. القاهرة (Cairo)
  { governorate: "القاهرة", center: "مدينة القاهرة", lat: 30.0444, lng: 31.2357 },
  { governorate: "القاهرة", center: "حلوان", lat: 29.8492, lng: 31.3342 },
  { governorate: "القاهرة", center: "القاهرة الجديدة", lat: 30.0298, lng: 31.4779 },
  { governorate: "القاهرة", center: "بدر", lat: 30.1381, lng: 31.7454 },
  { governorate: "القاهرة", center: "الشروق", lat: 30.1172, lng: 31.6067 },
  { governorate: "القاهرة", center: "المرج", lat: 30.1500, lng: 31.3333 },
  { governorate: "القاهرة", center: "15 مايو", lat: 29.8398, lng: 31.3734 },

  // 2. الجيزة (Giza)
  { governorate: "الجيزة", center: "مدينة الجيزة", lat: 30.0131, lng: 31.2089 },
  { governorate: "الجيزة", center: "أبو النمرس", lat: 29.9531, lng: 31.2181 },
  { governorate: "الجيزة", center: "البدرشين", lat: 29.8528, lng: 31.2681 },
  { governorate: "الجيزة", center: "العياط", lat: 29.6200, lng: 31.2500 },
  { governorate: "الجيزة", center: "أطفيح", lat: 29.4167, lng: 31.2500 },
  { governorate: "الجيزة", center: "الصف", lat: 29.5667, lng: 31.2833 },
  { governorate: "الجيزة", center: "منشأة القناطر", lat: 30.1833, lng: 31.0833 },
  { governorate: "الجيزة", center: "أوسيم", lat: 30.1225, lng: 31.1353 },
  { governorate: "الجيزة", center: "كرداسة", lat: 30.0322, lng: 31.1119 },
  { governorate: "الجيزة", center: "6 أكتوبر", lat: 29.9700, lng: 30.9500 },
  { governorate: "الجيزة", center: "الشيخ زايد", lat: 30.0441, lng: 30.9833 },
  { governorate: "الجيزة", center: "الواحات البحرية", lat: 28.3522, lng: 28.8828 },

  // 3. الإسكندرية (Alexandria)
  { governorate: "الإسكندرية", center: "مدينة الإسكندرية", lat: 31.2001, lng: 29.9187 },
  { governorate: "الإسكندرية", center: "برج العرب", lat: 30.9167, lng: 29.6833 },
  { governorate: "الإسكندرية", center: "العامرية", lat: 31.0200, lng: 29.8000 },

  // 4. القليوبية (Qalyubia)
  { governorate: "القليوبية", center: "بنها", lat: 30.4667, lng: 31.1833 },
  { governorate: "القليوبية", center: "قليوب", lat: 30.1799, lng: 31.2064 },
  { governorate: "القليوبية", center: "شبرا الخيمة", lat: 30.1286, lng: 31.2422 },
  { governorate: "القليوبية", center: "الخانكة", lat: 30.2167, lng: 31.3667 },
  { governorate: "القليوبية", center: "شبين القناطر", lat: 30.3125, lng: 31.3192 },
  { governorate: "القليوبية", center: "طوخ", lat: 30.3556, lng: 31.1989 },
  { governorate: "القليوبية", center: "القناطر الخيرية", lat: 30.1942, lng: 31.1328 },
  { governorate: "القليوبية", center: "كفر شكر", lat: 30.5489, lng: 31.2678 },
  { governorate: "القليوبية", center: "قها", lat: 30.2833, lng: 31.1833 },
  { governorate: "القليوبية", center: "العبور", lat: 30.2333, lng: 31.4833 },

  // 5. الدقهلية (Dakahlia)
  { governorate: "الدقهلية", center: "المنصورة", lat: 31.0409, lng: 31.3785 },
  { governorate: "الدقهلية", center: "طلحا", lat: 31.0539, lng: 31.3789 },
  { governorate: "الدقهلية", center: "ميت غمر", lat: 30.7192, lng: 31.2528 },
  { governorate: "الدقهلية", center: "السنبلاوين", lat: 30.8758, lng: 31.4633 },
  { governorate: "الدقهلية", center: "دكرنس", lat: 31.0883, lng: 31.5950 },
  { governorate: "الدقهلية", center: "أجا", lat: 30.9417, lng: 31.2933 },
  { governorate: "الدقهلية", center: "منية النصر", lat: 31.1278, lng: 31.6444 },
  { governorate: "الدقهلية", center: "المنزلة", lat: 31.1567, lng: 31.8683 },
  { governorate: "الدقهلية", center: "المطرية", lat: 31.1817, lng: 32.0308 },
  { governorate: "الدقهلية", center: "شربين", lat: 31.1925, lng: 31.5208 },
  { governorate: "الدقهلية", center: "بلقاس", lat: 31.2222, lng: 31.3622 },
  { governorate: "الدقهلية", center: "تمى الأمديد", lat: 30.8903, lng: 31.5492 },
  { governorate: "الدقهلية", center: "بني عبيد", lat: 31.0267, lng: 31.6367 },
  { governorate: "الدقهلية", center: "نبروه", lat: 31.0825, lng: 31.3006 },
  { governorate: "الدقهلية", center: "ميت سلسيل", lat: 31.1500, lng: 31.7500 },
  { governorate: "الدقهلية", center: "الجمالية", lat: 31.2167, lng: 31.8667 },
  { governorate: "الدقهلية", center: "محلة دمنة", lat: 31.0667, lng: 31.4833 },
  { governorate: "الدقهلية", center: "جمصة", lat: 31.4333, lng: 31.4833 },

  // 6. الشرقية (Sharqia)
  { governorate: "الشرقية", center: "الزقازيق", lat: 30.5877, lng: 31.5020 },
  { governorate: "الشرقية", center: "بلبيس", lat: 30.4167, lng: 31.5667 },
  { governorate: "الشرقية", center: "منيا القمح", lat: 30.5167, lng: 31.3500 },
  { governorate: "الشرقية", center: "أبو كبير", lat: 30.7250, lng: 31.6708 },
  { governorate: "الشرقية", center: "فاقوس", lat: 30.7314, lng: 31.7972 },
  { governorate: "الشرقية", center: "ههيا", lat: 30.6694, lng: 31.5925 },
  { governorate: "الشرقية", center: "كفر صقر", lat: 30.8000, lng: 31.6236 },
  { governorate: "الشرقية", center: "أولاد صقر", lat: 30.9500, lng: 31.8167 },
  { governorate: "الشرقية", center: "مشتول السوق", lat: 30.3606, lng: 31.3781 },
  { governorate: "الشرقية", center: "الحسينية", lat: 30.8700, lng: 31.9167 },
  { governorate: "الشرقية", center: "ديرب نجم", lat: 30.7525, lng: 31.4550 },
  { governorate: "الشرقية", center: "أبو حماد", lat: 30.5333, lng: 31.6833 },
  { governorate: "الشرقية", center: "الإبراهيمية", lat: 30.7167, lng: 31.5667 },
  { governorate: "الشرقية", center: "العاشر من رمضان", lat: 30.2989, lng: 31.7422 },
  { governorate: "الشرقية", center: "صان الحجر", lat: 30.9667, lng: 31.8833 },
  { governorate: "الشرقية", center: "الصالحية الجديدة", lat: 30.6500, lng: 31.8667 },
  { governorate: "الشرقية", center: "القنايات", lat: 30.6000, lng: 31.4667 },

  // 7. المنوفية (Monufia)
  { governorate: "المنوفية", center: "شبين الكوم", lat: 30.5503, lng: 31.0106 },
  { governorate: "المنوفية", center: "منوف", lat: 30.4667, lng: 30.9333 },
  { governorate: "المنوفية", center: "أشمون", lat: 30.2981, lng: 30.9767 },
  { governorate: "المنوفية", center: "قويسنا", lat: 30.5667, lng: 31.1500 },
  { governorate: "المنوفية", center: "تلا", lat: 30.6803, lng: 30.9439 },
  { governorate: "المنوفية", center: "الباجور", lat: 30.4300, lng: 31.0350 },
  { governorate: "المنوفية", center: "الشهداء", lat: 30.5975, lng: 30.8986 },
  { governorate: "المنوفية", center: "بركة السبع", lat: 30.6389, lng: 31.0861 },
  { governorate: "المنوفية", center: "مدينة السادات", lat: 30.3800, lng: 30.5200 },
  { governorate: "المنوفية", center: "سرْس الليان", lat: 30.4417, lng: 30.9667 },

  // 8. الغربية (Gharbia)
  { governorate: "الغربية", center: "طنطا", lat: 30.7865, lng: 31.0004 },
  { governorate: "الغربية", center: "المحلة الكبرى", lat: 30.9706, lng: 31.1669 },
  { governorate: "الغربية", center: "زفتى", lat: 30.7139, lng: 31.2417 },
  { governorate: "الغربية", center: "سمنود", lat: 30.9622, lng: 31.2425 },
  { governorate: "الغربية", center: "كفر الزيات", lat: 30.8228, lng: 30.8142 },
  { governorate: "الغربية", center: "بسيون", lat: 30.9639, lng: 30.8164 },
  { governorate: "الغربية", center: "قطور", lat: 30.9317, lng: 31.0253 },
  { governorate: "الغربية", center: "السنطة", lat: 30.6908, lng: 31.1206 },

  // 9. البحيرة (Beheira)
  { governorate: "البحيرة", center: "دمنهور", lat: 31.0361, lng: 30.4694 },
  { governorate: "البحيرة", center: "كفر الدوار", lat: 31.1322, lng: 30.1308 },
  { governorate: "البحيرة", center: "رشيد", lat: 31.4000, lng: 30.4167 },
  { governorate: "البحيرة", center: "أبو حمص", lat: 31.1000, lng: 30.3167 },
  { governorate: "البحيرة", center: "أبو المطامير", lat: 30.9100, lng: 30.1700 },
  { governorate: "البحيرة", center: "الدلنجات", lat: 30.8286, lng: 30.5367 },
  { governorate: "البحيرة", center: "كوم حمادة", lat: 30.7531, lng: 30.6978 },
  { governorate: "البحيرة", center: "حوش عيسى", lat: 30.9056, lng: 30.2889 },
  { governorate: "البحيرة", center: "إيتاي البارود", lat: 30.8864, lng: 30.6625 },
  { governorate: "البحيرة", center: "مركز بدر", lat: 30.5700, lng: 30.7100 },
  { governorate: "البحيرة", center: "إدكو", lat: 31.3000, lng: 30.3000 },
  { governorate: "البحيرة", center: "وادي النطرون", lat: 30.4167, lng: 30.3500 },
  { governorate: "البحيرة", center: "المحمودية", lat: 31.1833, lng: 30.5333 },
  { governorate: "البحيرة", center: "الرحمانية", lat: 31.1042, lng: 30.6381 },
  { governorate: "البحيرة", center: "شبراخيت", lat: 30.8167, lng: 30.7167 },
  { governorate: "البحيرة", center: "غرب النوبارية", lat: 30.8500, lng: 30.0667 },

  // 10. كفر الشيخ (Kafr El Sheikh)
  { governorate: "كفر الشيخ", center: "كفر الشيخ", lat: 31.1143, lng: 30.9401 },
  { governorate: "كفر الشيخ", center: "دسوق", lat: 31.1306, lng: 30.6475 },
  { governorate: "كفر الشيخ", center: "بلطيم", lat: 31.5583, lng: 31.0875 },
  { governorate: "كفر الشيخ", center: "فوه", lat: 31.2039, lng: 30.5489 },
  { governorate: "كفر الشيخ", center: "مطوبس", lat: 31.3197, lng: 30.5236 },
  { governorate: "كفر الشيخ", center: "الحامول", lat: 31.3136, lng: 31.1517 },
  { governorate: "كفر الشيخ", center: "سيدي سالم", lat: 31.2725, lng: 30.8039 },
  { governorate: "كفر الشيخ", center: "الرياض", lat: 31.2294, lng: 30.9486 },
  { governorate: "كفر الشيخ", center: "قلين", lat: 31.0600, lng: 30.8180 },
  { governorate: "كفر الشيخ", center: "بيلا", lat: 31.1719, lng: 31.2228 },
  { governorate: "كفر الشيخ", center: "سيدي غازي", lat: 31.1833, lng: 31.0167 },

  // 11. دمياط (Damietta)
  { governorate: "دمياط", center: "مدينة دمياط", lat: 31.4167, lng: 31.8133 },
  { governorate: "دمياط", center: "فارسكور", lat: 31.3300, lng: 31.7100 },
  { governorate: "دمياط", center: "كفر سعد", lat: 31.3683, lng: 31.6847 },
  { governorate: "دمياط", center: "الزرقا", lat: 31.2264, lng: 31.6367 },
  { governorate: "دمياط", center: "رأس البر", lat: 31.5150, lng: 31.8267 },
  { governorate: "دمياط", center: "كفر البطيخ", lat: 31.4000, lng: 31.7500 },

  // 12. بورسعيد (Port Said)
  { governorate: "بورسعيد", center: "مدينة بورسعيد", lat: 31.2565, lng: 32.2841 },
  { governorate: "بورسعيد", center: "بورفؤاد", lat: 31.2300, lng: 32.3200 },

  // 13. الإسماعيلية (Ismailia)
  { governorate: "الإسماعيلية", center: "مدينة الإسماعيلية", lat: 30.6043, lng: 32.2723 },
  { governorate: "الإسماعيلية", center: "القنطرة غرب", lat: 30.8300, lng: 32.3100 },
  { governorate: "الإسماعيلية", center: "القنطرة شرق", lat: 30.8500, lng: 32.3500 },
  { governorate: "الإسماعيلية", center: "فايد", lat: 30.3258, lng: 32.2961 },
  { governorate: "الإسماعيلية", center: "أبو صوير", lat: 30.5600, lng: 32.1000 },
  { governorate: "الإسماعيلية", center: "القصاصين", lat: 30.5667, lng: 31.9333 },
  { governorate: "الإسماعيلية", center: "التل الكبير", lat: 30.5500, lng: 31.9300 },

  // 14. السويس (Suez)
  { governorate: "السويس", center: "مدينة السويس", lat: 29.9668, lng: 32.5498 },
  { governorate: "السويس", center: "الأربعين", lat: 29.9800, lng: 32.5300 },
  { governorate: "السويس", center: "الجناين", lat: 30.1000, lng: 32.5500 },
  { governorate: "السويس", center: "عتاقة", lat: 29.9000, lng: 32.4833 },

  // 15. شمال سيناء (North Sinai)
  { governorate: "شمال سيناء", center: "العريش", lat: 31.1316, lng: 33.8033 },
  { governorate: "شمال سيناء", center: "الشيخ زويد", lat: 31.2167, lng: 34.1167 },
  { governorate: "شمال سيناء", center: "رفح", lat: 31.2800, lng: 34.2500 },
  { governorate: "شمال سيناء", center: "بئر العبد", lat: 31.0167, lng: 32.9833 },
  { governorate: "شمال سيناء", center: "نخل", lat: 29.9000, lng: 33.7500 },
  { governorate: "شمال سيناء", center: "الحسنة", lat: 30.4667, lng: 33.7833 },

  // 16. جنوب سيناء (South Sinai)
  { governorate: "جنوب سيناء", center: "الطور", lat: 28.2417, lng: 33.6222 },
  { governorate: "جنوب سيناء", center: "شرم الشيخ", lat: 27.9158, lng: 34.3299 },
  { governorate: "جنوب سيناء", center: "دهب", lat: 28.5097, lng: 34.5136 },
  { governorate: "جنوب سيناء", center: "نويبع", lat: 28.9700, lng: 34.6500 },
  { governorate: "جنوب سيناء", center: "سانت كاترين", lat: 28.5600, lng: 33.9500 },
  { governorate: "جنوب سيناء", center: "رأس سدر", lat: 29.5900, lng: 32.7100 },
  { governorate: "جنوب سيناء", center: "أبو رديس", lat: 28.9000, lng: 33.1833 },
  { governorate: "جنوب سيناء", center: "أبو زنيمة", lat: 29.0500, lng: 33.1000 },
  { governorate: "جنوب سيناء", center: "طابا", lat: 29.4925, lng: 34.8969 },

  // 17. بني سويف (Beni Suef)
  { governorate: "بني سويف", center: "بني سويف", lat: 29.0661, lng: 31.0994 },
  { governorate: "بني سويف", center: "الواسطى", lat: 29.3367, lng: 31.1894 },
  { governorate: "بني سويف", center: "ناصر", lat: 29.1700, lng: 31.1200 },
  { governorate: "بني سويف", center: "ببا", lat: 28.9167, lng: 30.9833 },
  { governorate: "بني سويف", center: "إهناسيا", lat: 29.0833, lng: 30.8167 },
  { governorate: "بني سويف", center: "سمسطا", lat: 28.9167, lng: 30.8500 },
  { governorate: "بني سويف", center: "الفشن", lat: 28.8167, lng: 30.9000 },

  // 18. الفيوم (Fayoum)
  { governorate: "الفيوم", center: "مدينة الفيوم", lat: 29.3084, lng: 30.8428 },
  { governorate: "الفيوم", center: "سنورس", lat: 29.4083, lng: 30.8653 },
  { governorate: "الفيوم", center: "إبشواي", lat: 29.3583, lng: 30.6811 },
  { governorate: "الفيوم", center: "إطسا", lat: 29.2389, lng: 30.7889 },
  { governorate: "الفيوم", center: "طامية", lat: 29.4778, lng: 30.9628 },
  { governorate: "الفيوم", center: "يوسف الصديق", lat: 29.2800, lng: 30.4500 },

  // 19. المنيا (Minya)
  { governorate: "المنيا", center: "مدينة المنيا", lat: 28.1099, lng: 30.7503 },
  { governorate: "المنيا", center: "مغاغة", lat: 28.6486, lng: 30.8422 },
  { governorate: "المنيا", center: "بني مزار", lat: 28.5000, lng: 30.8000 },
  { governorate: "المنيا", center: "مطاي", lat: 28.4167, lng: 30.7833 },
  { governorate: "المنيا", center: "سمالوط", lat: 28.3000, lng: 30.7167 },
  { governorate: "المنيا", center: "أبو قرقاص", lat: 27.9300, lng: 30.8300 },
  { governorate: "المنيا", center: "ملوي", lat: 27.7308, lng: 30.8419 },
  { governorate: "المنيا", center: "دير مواس", lat: 27.6389, lng: 30.8528 },
  { governorate: "المنيا", center: "العدوة", lat: 28.7200, lng: 30.7500 },

  // 20. أسيوط (Asyut)
  { governorate: "أسيوط", center: "مدينة أسيوط", lat: 27.1809, lng: 31.1837 },
  { governorate: "أسيوط", center: "ديروط", lat: 27.5564, lng: 30.8092 },
  { governorate: "أسيوط", center: "القوصية", lat: 27.4403, lng: 30.8186 },
  { governorate: "أسيوط", center: "منفلوط", lat: 27.3117, lng: 30.9703 },
  { governorate: "أسيوط", center: "أبنوب", lat: 27.2667, lng: 31.1500 },
  { governorate: "أسيوط", center: "الفتح", lat: 27.2000, lng: 31.2500 },
  { governorate: "أسيوط", center: "أبو تيج", lat: 27.0425, lng: 31.3197 },
  { governorate: "أسيوط", center: "صدفا", lat: 26.9083, lng: 31.3889 },
  { governorate: "أسيوط", center: "الغنايم", lat: 26.8611, lng: 31.3361 },
  { governorate: "أسيوط", center: "البداري", lat: 26.9917, lng: 31.4153 },
  { governorate: "أسيوط", center: "ساحل سليم", lat: 27.0500, lng: 31.3300 },

  // 21. سوهاج (Sohag)
  { governorate: "سوهاج", center: "مدينة سوهاج", lat: 26.5569, lng: 31.6948 },
  { governorate: "سوهاج", center: "طهطا", lat: 26.7694, lng: 31.5022 },
  { governorate: "سوهاج", center: "طما", lat: 26.8647, lng: 31.4283 },
  { governorate: "سوهاج", center: "أخميم", lat: 26.5639, lng: 31.7475 },
  { governorate: "سوهاج", center: "جرجا", lat: 26.3383, lng: 31.8917 },
  { governorate: "سوهاج", center: "البلينا", lat: 26.2300, lng: 31.9967 },
  { governorate: "سوهاج", center: "دار السلام", lat: 26.2667, lng: 32.0500 },
  { governorate: "سوهاج", center: "المنشأة", lat: 26.4764, lng: 31.8028 },
  { governorate: "سوهاج", center: "المراغة", lat: 26.6961, lng: 31.6036 },
  { governorate: "سوهاج", center: "ساقلتة", lat: 26.6500, lng: 31.7700 },
  { governorate: "سوهاج", center: "جهينة", lat: 26.6739, lng: 31.4981 },
  { governorate: "سوهاج", center: "العسيرات", lat: 26.4167, lng: 31.8333 },

  // 22. قنا (Qena)
  { governorate: "قنا", center: "مدينة قنا", lat: 26.1551, lng: 32.7160 },
  { governorate: "قنا", center: "نجع حمادي", lat: 26.0494, lng: 32.2414 },
  { governorate: "قنا", center: "دشنا", lat: 26.1242, lng: 32.4767 },
  { governorate: "قنا", center: "قوص", lat: 25.9189, lng: 32.7622 },
  { governorate: "قنا", center: "قفط", lat: 25.9981, lng: 32.8122 },
  { governorate: "قنا", center: "نقادة", lat: 25.9083, lng: 32.7264 },
  { governorate: "قنا", center: "فرشوط", lat: 26.0500, lng: 32.1667 },
  { governorate: "قنا", center: "أبو تشت", lat: 26.1333, lng: 32.0833 },
  { governorate: "قنا", center: "الوقف", lat: 26.1000, lng: 32.5000 },

  // 23. الأقصر (Luxor)
  { governorate: "الأقصر", center: "مدينة الأقصر", lat: 25.6872, lng: 32.6396 },
  { governorate: "الأقصر", center: "إسنا", lat: 25.2933, lng: 32.5567 },
  { governorate: "الأقصر", center: "أرمنت", lat: 25.6167, lng: 32.5333 },
  { governorate: "الأقصر", center: "طيبة", lat: 25.7500, lng: 32.7000 },
  { governorate: "الأقصر", center: "الطود", lat: 25.5800, lng: 32.6300 },
  { governorate: "الأقصر", center: "القرنة", lat: 25.7167, lng: 32.6167 },
  { governorate: "الأقصر", center: "الزينية", lat: 25.7667, lng: 32.6500 },

  // 24. أسوان (Aswan)
  { governorate: "أسوان", center: "مدينة أسوان", lat: 24.0889, lng: 32.8997 },
  { governorate: "أسوان", center: "كوم أمبو", lat: 24.4764, lng: 32.9461 },
  { governorate: "أسوان", center: "إدفو", lat: 24.9783, lng: 32.8789 },
  { governorate: "أسوان", center: "نصر النوبة", lat: 24.4000, lng: 32.9500 },
  { governorate: "أسوان", center: "دراو", lat: 24.4000, lng: 32.9333 },
  { governorate: "أسوان", center: "أبو سمبل", lat: 22.3486, lng: 31.6289 },

  // 25. البحر الأحمر (Red Sea)
  { governorate: "البحر الأحمر", center: "الغردقة", lat: 27.2579, lng: 33.8116 },
  { governorate: "البحر الأحمر", center: "رأس غارب", lat: 28.3583, lng: 33.0786 },
  { governorate: "البحر الأحمر", center: "سفاجا", lat: 26.7292, lng: 33.9365 },
  { governorate: "البحر الأحمر", center: "القصير", lat: 26.1078, lng: 34.2803 },
  { governorate: "البحر الأحمر", center: "مرسى علم", lat: 25.0754, lng: 34.8918 },
  { governorate: "البحر الأحمر", center: "شلاتين", lat: 23.1333, lng: 35.5833 },
  { governorate: "البحر الأحمر", center: "حلايب", lat: 22.2211, lng: 36.6453 },

  // 26. الوادي الجديد (New Valley)
  { governorate: "الوادي الجديد", center: "الخارجة", lat: 25.4514, lng: 30.5486 },
  { governorate: "الوادي الجديد", center: "الداخلة", lat: 25.5000, lng: 28.9667 },
  { governorate: "الوادي الجديد", center: "الفرافرة", lat: 27.0583, lng: 27.9706 },
  { governorate: "الوادي الجديد", center: "باريس", lat: 24.6789, lng: 30.6019 },
  { governorate: "الوادي الجديد", center: "بلاط", lat: 25.5667, lng: 29.2833 },

  // 27. مطروح (Matrouh)
  { governorate: "مطروح", center: "مرسى مطروح", lat: 31.3543, lng: 27.2373 },
  { governorate: "مطروح", center: "العلمين", lat: 30.8167, lng: 28.9500 },
  { governorate: "مطروح", center: "الضبعة", lat: 31.0333, lng: 28.4333 },
  { governorate: "مطروح", center: "سيوة", lat: 29.2033, lng: 25.5197 },
  { governorate: "مطروح", center: "السلوم", lat: 31.5833, lng: 25.1500 },
  { governorate: "مطروح", center: "النجيلة", lat: 31.4200, lng: 26.6900 },
  { governorate: "مطروح", center: "سيدي براني", lat: 31.6100, lng: 25.9200 },
  { governorate: "مطروح", center: "الحمام", lat: 30.8417, lng: 29.3944 }
];
