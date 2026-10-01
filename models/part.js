const pool = require("../libs/db_pool");

async function savePartCompatibility(conn, partId, data) {
  let modelList = [];
  if (data.veh_model_ids) {
    if (Array.isArray(data.veh_model_ids)) {
      modelList = data.veh_model_ids;
    } else if (typeof data.veh_model_ids === "string") {
      try {
        const parsed = JSON.parse(data.veh_model_ids);
        if (Array.isArray(parsed)) {
          modelList = parsed;
        } else {
          modelList = data.veh_model_ids.split(",").map((s) => s.trim()).filter(Boolean);
        }
      } catch (e) {
        modelList = data.veh_model_ids.split(",").map((s) => s.trim()).filter(Boolean);
      }
    } else {
      modelList = [];
    }
  } else if (data.veh_model_id) {
    modelList = [data.veh_model_id];
  } else {
    modelList = [];
  }

  // Legacy fallback years (ใช้เฉพาะกรณีเป็น scalar ID จาก request รูปแบบเก่าที่ไม่ได้ส่ง array object)
  let parsedLegacyYearFrom = null;
  if (data.vpc_year_from !== undefined && data.vpc_year_from !== null && data.vpc_year_from !== "") {
    const y = parseInt(data.vpc_year_from);
    if (!isNaN(y)) parsedLegacyYearFrom = y;
  }

  let parsedLegacyYearTo = null;
  if (data.vpc_year_to !== undefined && data.vpc_year_to !== null && data.vpc_year_to !== "") {
    const y = parseInt(data.vpc_year_to);
    if (!isNaN(y)) parsedLegacyYearTo = y;
  }

  for (const m of modelList) {
    let modelId;
    let yFrom = null;
    let yTo = null;

    if (typeof m === "object" && m !== null) {
      modelId = m.vm_id || m.model_id;

      const rawYFrom = m.vpc_year_from !== undefined ? m.vpc_year_from : m.year_from;
      if (rawYFrom !== undefined && rawYFrom !== null && rawYFrom !== "") {
        const y = parseInt(rawYFrom);
        if (!isNaN(y)) {
          yFrom = y;
        }
      }

      const rawYTo = m.vpc_year_to !== undefined ? m.vpc_year_to : m.year_to;
      if (rawYTo !== undefined && rawYTo !== null && rawYTo !== "") {
        const y = parseInt(rawYTo);
        if (!isNaN(y)) {
          yTo = y;
        }
      }
    } else {
      modelId = parseInt(m);
      yFrom = parsedLegacyYearFrom;
      yTo = parsedLegacyYearTo;
    }

    if (modelId && !isNaN(modelId)) {
      await conn.query(
        "INSERT INTO vehicle_part_compatibility (vpc_part_id, vpc_vehicle_model_id, vpc_year_from, vpc_year_to) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING",
        [partId, modelId, yFrom, yTo],
      );
    }
  }
}

module.exports = {
  getPart: async () => {
    let conn;
    let result;

    try {
      conn = await pool.connect();

      var sql = `
        SELECT DISTINCT ON (p.part_id)
          p.part_id,
          p.part_code,
          p.part_name,
          p.part_price,
          p.unit,
          p.part_is_active,
          p.part_url,
          p.part_brand_id,
          p.part_category_id,
          pb.pb_name,
          pc.pc_name,
          vpc.vpc_vehicle_model_id,
          vm.vm_name,
          vb.vb_name,
          vpc.vpc_year_from,
          vpc.vpc_year_to,
          COALESCE(
            (
              SELECT JSON_AGG(
                JSON_BUILD_OBJECT(
                  'vm_id', vm2.vm_id,
                  'vm_name', vm2.vm_name,
                  'vb_name', vb2.vb_name,
                  'vpc_year_from', vpc2.vpc_year_from,
                  'vpc_year_to', vpc2.vpc_year_to
                )
              )
              FROM vehicle_part_compatibility vpc2
              JOIN vehicle_model vm2 ON vpc2.vpc_vehicle_model_id = vm2.vm_id
              LEFT JOIN vehicle_brand vb2 ON vm2.vm_brand_id = vb2.vb_id
              WHERE vpc2.vpc_part_id = p.part_id
            ),
            '[]'::json
          ) AS compatible_models
        FROM part p
          LEFT JOIN vehicle_part_compatibility vpc ON p.part_id = vpc.vpc_part_id
          LEFT JOIN vehicle_model vm ON vpc.vpc_vehicle_model_id = vm.vm_id
          LEFT JOIN vehicle_brand vb ON vm.vm_brand_id = vb.vb_id
          LEFT JOIN part_brand pb ON p.part_brand_id = pb.pb_id 
          LEFT JOIN part_category pc ON p.part_category_id = pc.pc_id
        ORDER BY p.part_id DESC;
      `;

      var rows = await conn.query(sql);

      result = {
        isError: false,
        data: rows.rows,
        errorMessage: "",
      };
    } catch (error) {
      result = {
        isError: true,
        data: "",
        errorMessage: error.message,
      };
    } finally {
      if (conn) {
        conn.release();
      }

      return result;
    }
  },

  addPart: async (data) => {
    let conn;
    let result;

    try {
      conn = await pool.connect();
      await conn.query("BEGIN");

      let partCode = "";
      if (data.part_code && data.part_code.trim() !== "") {
        partCode = data.part_code.trim();
      } else {
        partCode = "P-" + Date.now().toString().slice(-6);
      }

      let partPrice = 0.00;
      if (data.part_price !== undefined && data.part_price !== null && data.part_price !== "") {
        partPrice = parseFloat(data.part_price);
      }

      let unit = "ชิ้น";
      if (data.unit && data.unit.trim() !== "") {
        unit = data.unit.trim();
      } else {
        unit = "ชิ้น";
      }

      let partUrl = null;
      if (data.part_url && data.part_url.trim() !== "") {
        partUrl = data.part_url.trim();
      } else {
        partUrl = null;
      }

      let partIsActive = true;
      if (data.part_is_active !== undefined && data.part_is_active !== null) {
        if (typeof data.part_is_active === "boolean") {
          partIsActive = data.part_is_active;
        } else if (data.part_is_active.toString().toLowerCase() === "true" || data.part_is_active === 1 || data.part_is_active === "1") {
          partIsActive = true;
        } else {
          partIsActive = false;
        }
      }

      var sql = `
        INSERT INTO part
            (part_code, part_name, part_price, part_category_id, part_brand_id, unit, part_url, part_is_active)
        VALUES
            ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING part_id
      `;

      const insertRes = await conn.query(sql, [
        partCode,
        data.part_name,
        partPrice,
        data.part_category_id,
        data.part_brand_id,
        unit,
        partUrl,
        partIsActive,
      ]);

      const newPartId = insertRes.rows[0].part_id;

      // บันทึกรุ่นรถและความเข้ากันได้ (vehicle_part_compatibility)
      await savePartCompatibility(conn, newPartId, data);

      await conn.query("COMMIT");

      result = {
        isError: false,
        data: "เพิ่มข้อมูลอะไหล่สำเร็จ",
        errorMessage: "",
      };
    } catch (error) {
      if (conn) {
        await conn.query("ROLLBACK");
      }

      result = {
        isError: true,
        data: "",
        errorMessage: error.message,
      };
    } finally {
      if (conn) {
        conn.release();
      }

      return result;
    }
  },

  editPart: async (data) => {
    let conn;
    let result;

    try {
      conn = await pool.connect();
      await conn.query("BEGIN");

      let partPrice = 0.00;
      if (data.part_price !== undefined && data.part_price !== null && data.part_price !== "") {
        partPrice = parseFloat(data.part_price);
      }

      let unit = "ชิ้น";
      if (data.unit && data.unit.trim() !== "") {
        unit = data.unit.trim();
      } else {
        unit = "ชิ้น";
      }

      let shouldUpdatePartUrl = data.part_url !== undefined;
      let partUrl = null;
      if (data.part_url && typeof data.part_url === "string" && data.part_url.trim() !== "" && data.part_url !== "null") {
        partUrl = data.part_url.trim();
      }

      let partCode = null;
      if (data.part_code && data.part_code.trim() !== "") {
        partCode = data.part_code.trim();
      } else {
        partCode = null;
      }

      var sql = `
        UPDATE part
        SET
            part_name = $1,
            part_price = $2,
            part_category_id = $3,
            part_brand_id = $4,
            part_url = CASE WHEN $5 THEN $6 ELSE part_url END,
            unit = COALESCE($7, unit),
            part_code = COALESCE($8, part_code)
        WHERE part_id = $9
      `;

      await conn.query(sql, [
        data.part_name,
        partPrice,
        data.part_category_id,
        data.part_brand_id,
        shouldUpdatePartUrl,
        partUrl,
        unit,
        partCode,
        data.part_id,
      ]);

      if (data.veh_model_ids !== undefined || (data.veh_model_id !== undefined && data.veh_model_id !== "")) {
        await conn.query(
          "DELETE FROM vehicle_part_compatibility WHERE vpc_part_id = $1",
          [data.part_id],
        );
        await savePartCompatibility(conn, data.part_id, data);
      }

      await conn.query("COMMIT");

      result = {
        isError: false,
        data: "แก้ไขข้อมูลอะไหล่สำเร็จ",
        errorMessage: "",
      };
    } catch (error) {
      if (conn) {
        await conn.query("ROLLBACK");
      }

      result = {
        isError: true,
        data: "",
        errorMessage: error.message,
      };
    } finally {
      if (conn) {
        conn.release();
      }

      return result;
    }
  },

  deletePart: async (part_id) => {
    let conn;
    let result;

    if (!part_id) {
      return {
        isError: true,
        data: "",
        errorMessage: "กรุณาระบุ part_id",
      };
    }

    try {
      conn = await pool.connect();
      // ปรับเป็น Soft delete โดยการปิดการใช้งาน (part_is_active = false) เพื่อรักษาประวัติงานซ่อม
      const sql = "UPDATE part SET part_is_active = false WHERE part_id = $1";
      await conn.query(sql, [part_id]);

      result = {
        isError: false,
        data: "ปิดการใช้งานข้อมูลอะไหล่สำเร็จ",
        errorMessage: "",
      };
    } catch (error) {
      result = {
        isError: true,
        data: "",
        errorMessage: error.message,
      };
    } finally {
      if (conn) {
        conn.release();
      }

      return result;
    }
  },

  getPartCategories: async () => {
    let conn;
    try {
      conn = await pool.connect();
      const sql = "SELECT pc_id, pc_name FROM part_category ORDER BY pc_id ASC";
      const { rows } = await conn.query(sql);
      return { isError: false, data: rows, errorMessage: "" };
    } catch (error) {
      return { isError: true, data: [], errorMessage: error.message };
    } finally {
      if (conn) {
        conn.release();
      }
    }
  },

  getPartBrands: async () => {
    let conn;
    try {
      conn = await pool.connect();
      const sql = "SELECT pb_id, pb_name FROM part_brand ORDER BY pb_id ASC";
      const { rows } = await conn.query(sql);
      return { isError: false, data: rows, errorMessage: "" };
    } catch (error) {
      return { isError: true, data: [], errorMessage: error.message };
    } finally {
      if (conn) {
        conn.release();
      }
    }
  },

  updatePartStatus: async (part_id, part_is_active) => {
    let conn;
    let result;

    try {
      conn = await pool.connect();
      const sql = "UPDATE part SET part_is_active = $1 WHERE part_id = $2";
      await conn.query(sql, [part_is_active, part_id]);

      result = {
        isError: false,
        data: "อัปเดตสถานะอะไหล่สำเร็จ",
        errorMessage: "",
      };
    } catch (error) {
      result = {
        isError: true,
        data: "",
        errorMessage: error.message,
      };
    } finally {
      if (conn) {
        conn.release();
      }

      return result;
    }
  },
};
