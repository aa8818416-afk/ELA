/**
 * Land Management Integration Test Suite (No-Draft System)
 * Verification of complete land registration, crop changes, and detail updates.
 */

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ Missing Supabase environment variables!");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

function toFeddan(value, unit) {
  if (!value) return 0;
  if (unit === "قيراط") return value / 24;
  if (unit === "متر مربع") return value / 4200;
  return value;
}

async function runTests() {
  console.log("🚀 Starting Land Management Test Suite (No-Draft System)...\n");

  let testFarmerId = null;
  let testFieldId = null;

  try {
    // 0. Fetch or create a test farmer profile
    const { data: farmer, error: fErr } = await supabase
      .from("farmers")
      .select("profile_id")
      .limit(1)
      .single();

    if (fErr || !farmer) {
      throw new Error("No test farmer found in DB: " + fErr?.message);
    }
    testFarmerId = farmer.profile_id;
    console.log(`📌 Using Test Farmer ID: ${testFarmerId}\n`);

    // -------------------------------------------------------------
    // SCENARIO 1: Full direct registration (register_field)
    // -------------------------------------------------------------
    console.log("-------------------------------------------------");
    console.log("🧪 Scenario 1: Full direct field registration");
    console.log("-------------------------------------------------");

    const newFieldData = {
      farmer_id: testFarmerId,
      field_name: "أرض الجمعية",
      crop_type: "طماطم",
      planting_date: "2026-06-01",
      area_feddan: 3,
      area_unit: "فدان",
      is_active: true,
    };

    const { data: registeredField, error: rErr } = await supabase
      .from("farmer_fields")
      .insert(newFieldData)
      .select()
      .single();

    if (rErr || !registeredField) {
      throw new Error("Failed to register direct field: " + rErr?.message);
    }
    testFieldId = registeredField.id;
    console.log(`  - Field registered ID: ${testFieldId}`);
    console.log(`  - Field Name: ${registeredField.field_name}`);
    console.log(`  - Active status: ${registeredField.is_active}`);
    console.log("✅ Scenario 1 PASSED: Direct registration successful!\n");

    // -------------------------------------------------------------
    // SCENARIO 2: Change crop & archive history (change_crop)
    // -------------------------------------------------------------
    console.log("-------------------------------------------------");
    console.log("🧪 Scenario 2: Change crop via RPC (archive_and_change_crop)");
    console.log("-------------------------------------------------");

    const newCrop = "بطاطس";
    const newPlantingDate = "2026-11-01";

    const { error: rpcErr } = await supabase.rpc("archive_and_change_crop", {
      p_field_id: testFieldId,
      p_farmer_id: testFarmerId,
      p_new_crop: newCrop,
      p_new_planting: newPlantingDate,
    });

    if (rpcErr) {
      throw new Error("RPC archive_and_change_crop failed: " + rpcErr.message);
    }

    // Verify updated field
    const { data: updatedField } = await supabase
      .from("farmer_fields")
      .select("crop_type, planting_date")
      .eq("id", testFieldId)
      .single();

    if (updatedField.crop_type !== newCrop || updatedField.planting_date !== newPlantingDate) {
      throw new Error(`FAIL: Field crop not updated! Got ${updatedField.crop_type}`);
    }

    // Verify history table
    const { data: history } = await supabase
      .from("farmer_field_crop_history")
      .select("*")
      .eq("farmer_field_id", testFieldId);

    if (!history || history.length === 0 || history[0].crop_type !== "طماطم") {
      throw new Error("FAIL: Crop history was not archived properly!");
    }
    console.log(`  - Archived old crop: ${history[0].crop_type} replaced by ${history[0].replaced_by}`);
    console.log(`  - New crop on field: ${updatedField.crop_type}`);
    console.log("✅ Scenario 2 PASSED: Crop changed and archived successfully!\n");

    // -------------------------------------------------------------
    // SCENARIO 3: Disambiguate duplicate field
    // -------------------------------------------------------------
    console.log("-------------------------------------------------");
    console.log("🧪 Scenario 3: Disambiguate land name");
    console.log("-------------------------------------------------");

    const disambiguatedData = {
      farmer_id: testFarmerId,
      field_name: "أرض الجمعية القبلية",
      crop_type: "قمح",
      planting_date: "2026-12-01",
      area_feddan: 2,
      area_unit: "فدان",
      is_active: true,
    };

    const { data: disField, error: disErr } = await supabase
      .from("farmer_fields")
      .insert(disambiguatedData)
      .select()
      .single();

    if (disErr || !disField) {
      throw new Error("Failed to insert disambiguated field: " + disErr?.message);
    }
    console.log(`  - Disambiguated Field Created: ${disField.field_name}`);
    console.log("✅ Scenario 3 PASSED: Disambiguation field registered!\n");

    // -------------------------------------------------------------
    // CLEANUP TEST DATA
    // -------------------------------------------------------------
    console.log("🧹 Cleaning up created test fields...");
    await supabase.from("farmer_fields").delete().eq("id", testFieldId);
    await supabase.from("farmer_fields").delete().eq("id", disField.id);
    console.log("✨ Cleanup finished.\n");

    console.log("🎉 ALL TESTS PASSED SUCCESSFULLY! Land management (No-Draft) verified.");
  } catch (err) {
    console.error("❌ Test suite failed with error:", err.message);
    if (testFieldId) {
      await supabase.from("farmer_fields").delete().eq("id", testFieldId);
    }
    process.exit(1);
  }
}

runTests();
