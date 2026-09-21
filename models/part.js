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
          p.part_brand,
          p.part_url,
          vpc.vpc_vehicle_model_id AS veh_model_id,
          vm.vm_name AS model_name,
          vb.vb_name AS vehicle_brand_name
        FROM part p
        LEFT JOIN vehicle_part_compatibility vpc ON p.part_id = vpc.vpc_part_id
        LEFT JOIN vehicle_model vm ON vpc.vpc_vehicle_model_id = vm.vm_id
        LEFT JOIN vehicle_brand vb ON vm.vm_brand_id = vb.vb_id
        ORDER BY p.part_id DESC
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
            (part_name, part_price, part_brand, part_url)
        VALUES
            ($1, $2, $3, $4)
        RETURNING part_id
      `;

      const insertRes = await conn.query(sql, [
        data.part_name,
        data.part_price,
        data.part_brand,
        data.part_url || null,
      ]);

      const newPartId = insertRes.rows[0].part_id;

      if (data.veh_model_id) {
        await conn.query(
          "INSERT INTO vehicle_part_compatibility (vpc_part_id, vpc_vehicle_model_id) VALUES ($1, $2)",
          [newPartId, data.veh_model_id]
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
            part_brand = $3,
            part_url = $4
        WHERE part_id = $5
      `;

      await conn.query(sql, [
        data.part_name,
        data.part_price,
        data.part_brand,
        data.part_url || null,
        data.part_id,
      ]);

      if (data.veh_model_id !== undefined && data.veh_model_id !== "") {
        await conn.query(
          "DELETE FROM vehicle_part_compatibility WHERE vpc_part_id = $1",
          [data.part_id]
        );
        if (data.veh_model_id) {
          await conn.query(
            "INSERT INTO vehicle_part_compatibility (vpc_part_id, vpc_vehicle_model_id) VALUES ($1, $2)",
            [data.part_id, data.veh_model_id]
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
        [part_id]
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
};
