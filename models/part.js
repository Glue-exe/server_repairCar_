const pool = require("../libs/db_pool");

module.exports = {
  getPart: async () => {
    let conn;
    let result;

    try {
      conn = await pool.connect();

      var sql = `
        SELECT DISTINCT ON (p.part_id)
        p.part_id,
        p.part_name,
        p.part_price,
        pb.pb_id,
        pc.pc_id,
        pb.pb_id AS part_brand_id,
        pc.pc_id AS part_category_id,
        pb.pb_name AS part_brand_name,
        pc.pc_name AS part_category_name,
        p.part_url,
        vpc.vpc_vehicle_model_id AS veh_model_id,
        vm.vm_name AS model_name,
        vb.vb_name AS vehicle_brand_name
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
      if (conn) conn.release();

      return result;
    }
  },

  addPart: async (data) => {
    let conn;
    let result;

    try {
      conn = await pool.connect();
      await conn.query("BEGIN");

      var sql = `
        INSERT INTO part
            (part_name, part_price, part_category_id, part_brand_id, part_url)
        VALUES
            ($1, $2, $3, $4, $5)
        RETURNING part_id
      `;

      const insertRes = await conn.query(sql, [
        data.part_name,
        data.part_price,
        data.part_category_id,
        data.part_brand_id,
        data.part_url || null,
      ]);

      const newPartId = insertRes.rows[0].part_id;

      if (data.veh_model_id) {
        await conn.query(
          "INSERT INTO vehicle_part_compatibility (vpc_part_id, vpc_vehicle_model_id) VALUES ($1, $2)",
          [newPartId, data.veh_model_id],
        );
      }

      await conn.query("COMMIT");

      result = {
        isError: false,
        data: "เพิ่มข้อมูลอะไหล่สำเร็จ",
        errorMessage: "",
      };
    } catch (error) {
      if (conn) await conn.query("ROLLBACK");

      result = {
        isError: true,
        data: "",
        errorMessage: error.message,
      };
    } finally {
      if (conn) conn.release();

      return result;
    }
  },

  editPart: async (data) => {
    let conn;
    let result;

    try {
      conn = await pool.connect();
      await conn.query("BEGIN");

      var sql = `
        UPDATE part
        SET
            part_name = $1,
            part_price = $2,
            part_category_id = $3,
            part_brand_id = $4,
            part_url = $5
        WHERE part_id = $6
      `;

      await conn.query(sql, [
        data.part_name,
        data.part_price,
        data.part_category_id,
        data.part_brand_id,
        data.part_url || null,
        data.part_id,
      ]);

      if (data.veh_model_id !== undefined && data.veh_model_id !== "") {
        await conn.query(
          "DELETE FROM vehicle_part_compatibility WHERE vpc_part_id = $1",
          [data.part_id],
        );
        if (data.veh_model_id) {
          await conn.query(
            "INSERT INTO vehicle_part_compatibility (vpc_part_id, vpc_vehicle_model_id) VALUES ($1, $2)",
            [data.part_id, data.veh_model_id],
          );
        }
      }

      await conn.query("COMMIT");

      result = {
        isError: false,
        data: "แก้ไขข้อมูลอะไหล่สำเร็จ",
        errorMessage: "",
      };
    } catch (error) {
      if (conn) await conn.query("ROLLBACK");

      result = {
        isError: true,
        data: "",
        errorMessage: error.message,
      };
    } finally {
      if (conn) conn.release();

      return result;
    }
  },

  deletePart: async (part_id) => {
    let conn;
    let result;

    try {
      conn = await pool.connect();
      await conn.query("BEGIN");

      // ลบความสัมพันธ์กับรุ่นรถก่อน
      await conn.query(
        "DELETE FROM vehicle_part_compatibility WHERE vpc_part_id = $1",
        [part_id],
      );

      var sql = `DELETE FROM part WHERE part_id = $1`;
      await conn.query(sql, [part_id]);

      await conn.query("COMMIT");

      result = {
        isError: false,
        data: "ลบข้อมูลอะไหล่สำเร็จ",
        errorMessage: "",
      };
    } catch (error) {
      if (conn) await conn.query("ROLLBACK");

      result = {
        isError: true,
        data: "",
        errorMessage: error.message,
      };
    } finally {
      if (conn) conn.release();

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
      if (conn) conn.release();
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
      if (conn) conn.release();
    }
  },
};
