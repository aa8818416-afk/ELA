const { createClient } = require("@supabase/supabase-js");

// Read environment variables
const supabaseUrl = "https://oiacbloedbdkqgcgalry.supabase.co";
const serviceRoleKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9pYWNibG9lZGJka3FnY2dhbHJ5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4Mzk0MzAxOSwiZXhwIjoyMDk5NTE5MDE5fQ.HcENY2fV8V05GsLP3zxTh-f6xhFeQyaVxwHMXGkuvFM";

const supabase = createClient(supabaseUrl, serviceRoleKey);

// Utility: area conversion
function toFeddan(value, unit = "فدان") {
  if (unit === "قيراط") return Math.round((value / 24) * 1000) / 1000;
  if (unit === "متر مربع") return Math.round((value / 4200) * 1000) / 1000;
  return value;
}

async function runTests() {
  console.log("=================================================");
  console.log("🚀 Starting Integration Verification Test Suite");
  console.log("=================================================\n");

  let testFarmerId = null;
  let testFieldId = null;

  try {
    // 0. Get or select a test farmer profile ID
    const { data: farmer, error: fErr } = await supabase
      .from("farmers")
      .select("profile_id")
      .limit(1)
      .single();

    if (fErr || !farmer) {
      throw new Error("Could not fetch test farmer profile from database: " + (fErr ? fErr.message : "No farmer found"));
    }
    testFarmerId = farmer.profile_id;
    console.log(`✅ Step 0: Test Farmer ID selected: ${testFarmerId}\n`);

    // -------------------------------------------------------------
    // SCENARIO 1: Draft without a name being completed in second turn
    // -------------------------------------------------------------
    console.log("-------------------------------------------------");
    console.log("🧪 Scenario 1: Initial draft without a field_name, completed in turn 2");
    console.log("-------------------------------------------------");

    // Turn 1: Farmer mentions "زرعت طماطم 3 أفدنة" (No name)
    const turn1Insert = {
      farmer_id: testFarmerId,
      field_name: null,
      crop_type: "طماطم",
      planting_date: "2026-06-01",
      area_feddan: 3,
      area_unit: "فدان",
      registration_status: "draft",
      is_active: false,
      draft_collected_fields: { crop_type: true, planting_date: true, area: true, field_name: false },
    };

    const { data: createdDraft, error: dErr } = await supabase
      .from("farmer_fields")
      .insert(turn1Insert)
      .select()
      .single();

    if (dErr || !createdDraft) {
      throw new Error("Failed to create initial unnamed draft: " + dErr?.message);
    }
    testFieldId = createdDraft.id;
    console.log(`  - Turn 1 created draft ID: ${testFieldId}`);
    console.log(`  - Initial draft field_name: ${createdDraft.field_name || "NULL (No name)"}`);

    // Turn 2: Farmer now says "اسمها أرض التسعة"
    // Logic test: namesMatch = !incomingName || !draftName || incomingName === draftName
    const draftName = createdDraft.field_name?.trim().toLowerCase() || "";
    const incomingName = "أرض التسعة".trim().toLowerCase();
    const namesMatch = !incomingName || !draftName || incomingName === draftName;

    console.log(`  - Checking namesMatch logic: draftName="${draftName}", incomingName="${incomingName}" => namesMatch=${namesMatch}`);

    if (!namesMatch) {
      throw new Error("FAIL: namesMatch evaluated to false when draftName was empty!");
    }

    // Perform turn 2 update on SAME draft row
    const { data: updatedDraft, error: uErr } = await supabase
      .from("farmer_fields")
      .update({
        field_name: "أرض التسعة",
        draft_collected_fields: { ...createdDraft.draft_collected_fields, field_name: true },
        updated_at: new Date().toISOString(),
      })
      .eq("id", testFieldId)
      .select()
      .single();

    if (uErr || !updatedDraft) {
      throw new Error("Failed to update draft with field_name: " + uErr?.message);
    }

    if (updatedDraft.id !== testFieldId || updatedDraft.field_name !== "أرض التسعة") {
      throw new Error("FAIL: Draft ID mismatch or field_name not updated correctly!");
    }
    console.log("✅ Scenario 1 PASSED: Unnamed draft successfully updated on same row without conflict!\n");

    // -------------------------------------------------------------
    // SCENARIO 2: confirm_save with fallback & first-time area value
    // -------------------------------------------------------------
    console.log("-------------------------------------------------");
    console.log("🧪 Scenario 2: confirm_save with new area_value & fallback variables");
    console.log("-------------------------------------------------");

    // Simulate AI invoking confirm_save where area_value is passed as 5 feddans (previously 3)
    const args = {
      action: "confirm_save",
      area_value: 5,
      area_unit: "فدان",
    };

    // Merged fallback logic
    const final_field_name = args.field_name ?? updatedDraft.field_name;
    const final_crop_type = args.crop_type ?? updatedDraft.crop_type;
    const final_planting_date = args.planting_date ?? updatedDraft.planting_date;
    const final_area_feddan = args.area_value != null
      ? toFeddan(args.area_value, args.area_unit || updatedDraft.area_unit || "فدان")
      : updatedDraft.area_feddan;
    const final_area_unit = args.area_unit ?? updatedDraft.area_unit ?? "فدان";

    // Validate completeness on final variables
    const missing = [];
    if (!final_field_name) missing.push("field_name");
    if (!final_crop_type) missing.push("crop_type");
    if (!final_planting_date) missing.push("planting_date");
    if (final_area_feddan == null) missing.push("area");

    console.log(`  - Merged values: field_name="${final_field_name}", crop="${final_crop_type}", date="${final_planting_date}", area=${final_area_feddan}`);
    console.log(`  - Missing fields check: ${missing.length === 0 ? "None (Complete!)" : missing.join(", ")}`);

    if (missing.length > 0) {
      throw new Error("FAIL: confirm_save failed completeness check!");
    }

    // Update to active
    const { data: activatedField, error: actErr } = await supabase
      .from("farmer_fields")
      .update({
        registration_status: "active",
        is_active: true,
        draft_collected_fields: null,
        field_name: final_field_name,
        crop_type: final_crop_type,
        planting_date: final_planting_date,
        area_feddan: final_area_feddan,
        area_unit: final_area_unit,
        updated_at: new Date().toISOString(),
      })
      .eq("id", testFieldId)
      .select()
      .single();

    if (actErr || !activatedField) {
      throw new Error("Failed to activate field: " + actErr?.message);
    }

    if (activatedField.registration_status !== "active" || activatedField.is_active !== true || activatedField.area_feddan !== 5) {
      throw new Error("FAIL: Activated field state or area_feddan incorrect!");
    }
    console.log("✅ Scenario 2 PASSED: Field activated with registration_status='active', is_active=true, area_feddan=5!\n");

    // -------------------------------------------------------------
    // SCENARIO 3: Crop change with RPC archiving
    // -------------------------------------------------------------
    console.log("-------------------------------------------------");
    console.log("🧪 Scenario 3: change_crop RPC archiving in farmer_field_crop_history");
    console.log("-------------------------------------------------");

    const newCrop = "قمح";
    const newPlantingDate = "2026-11-01";

    console.log(`  - Calling RPC archive_and_change_crop for field ${testFieldId}: changing from "${activatedField.crop_type}" to "${newCrop}"...`);

    const { error: rpcErr } = await supabase.rpc("archive_and_change_crop", {
      p_field_id: testFieldId,
      p_farmer_id: testFarmerId,
      p_new_crop: newCrop,
      p_new_planting: newPlantingDate,
    });

    if (rpcErr) {
      throw new Error("RPC archive_and_change_crop failed: " + rpcErr.message);
    }

    // Verify history entry
    const { data: historyEntries, error: hErr } = await supabase
      .from("farmer_field_crop_history")
      .select("*")
      .eq("farmer_field_id", testFieldId);

    if (hErr || !historyEntries || historyEntries.length === 0) {
      throw new Error("FAIL: No crop history record found after change_crop!");
    }

    const historyRecord = historyEntries[0];
    console.log(`  - Archived history record found: ID=${historyRecord.id}, old_crop="${historyRecord.crop_type}", replaced_by="${historyRecord.replaced_by}"`);

    if (historyRecord.crop_type !== "طماطم" || historyRecord.replaced_by !== "قمح") {
      throw new Error("FAIL: Crop history entry content does not match old crop ('طماطم') and replacement ('قمح')!");
    }

    // Verify field updated
    const { data: updatedFieldAfterCropChange } = await supabase
      .from("farmer_fields")
      .select("crop_type, planting_date")
      .eq("id", testFieldId)
      .single();

    if (updatedFieldAfterCropChange.crop_type !== "قمح" || updatedFieldAfterCropChange.planting_date !== "2026-11-01") {
      throw new Error("FAIL: Field crop_type or planting_date was not updated in farmer_fields!");
    }
    console.log("✅ Scenario 3 PASSED: Old crop 'طماطم' archived to farmer_field_crop_history and field updated to 'قمح'!\n");

    console.log("=================================================");
    console.log("🎉 ALL 3 CRITICAL SCENARIOS PASSED empirical DB verification!");
    console.log("=================================================");

  } catch (err) {
    console.error("\n❌ VERIFICATION TEST FAILED:", err.message || err);
    process.exitCode = 1;
  } finally {
    // Cleanup test data
    if (testFieldId) {
      console.log(`\n🧹 Cleaning up test field ${testFieldId}...`);
      await supabase.from("farmer_field_crop_history").delete().eq("farmer_field_id", testFieldId);
      await supabase.from("farmer_fields").delete().eq("id", testFieldId);
      console.log("✨ Cleanup completed successfully.");
    }
  }
}

runTests();
