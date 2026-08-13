const pool = require("../libs/db_pool.js");

module.exports = {
  // Brand CRUD
  getBrands: async () => {
    let conn;
    try {
      conn = await pool.connect();
      const sql = "SELECT MIN(brand_id) AS brand_id, brand_name FROM vehicle_brand GROUP BY brand_name ORDER BY brand_name ASC";
      const { rows } = await conn.query(sql);
      return { isError: false, data: rows, errorMessage: "" };
    } catch (error) {
      return { isError: true, data: [], errorMessage: error.message };
    } finally {
      if (conn) conn.release();
    }
  },

  addBrand: async (data) => {
    let conn;
    try {
      conn = await pool.connect();
      const sql = "INSERT INTO vehicle_brand (brand_name) VALUES ($1) RETURNING brand_id";
      const { rows } = await conn.query(sql, [data.brand_name]);
      return { isError: false, data: rows[0], errorMessage: "" };
    } catch (error) {
      return { isError: true, data: null, errorMessage: error.message };
    } finally {
      if (conn) conn.release();
    }
  },

  updateBrand: async (data) => {
    let conn;
    try {
      conn = await pool.connect();
      
      const oldRes = await conn.query("SELECT brand_name FROM vehicle_brand WHERE brand_id = $1", [data.brand_id]);
      const oldBrandName = oldRes.rows[0]?.brand_name;

      if (oldBrandName) {
        const sql = "UPDATE vehicle_brand SET brand_name = $1 WHERE brand_name = $2";
        await conn.query(sql, [data.brand_name, oldBrandName]);
      }
      return { isError: false, message: "อัปเดตยี่ห้อรถยนต์สำเร็จ", errorMessage: "" };
    } catch (error) {
      return { isError: true, errorMessage: error.message };
    } finally {
      if (conn) conn.release();
    }
  },

  deleteBrand: async (brandId) => {
    let conn;
    try {
      conn = await pool.connect();
      const sql = "DELETE FROM vehicle_brand WHERE brand_id = $1";
      await conn.query(sql, [brandId]);
      return { isError: false, message: "ลบยี่ห้อรถยนต์สำเร็จ", errorMessage: "" };
    } catch (error) {
      return { isError: true, errorMessage: error.message };
    } finally {
      if (conn) conn.release();
    }
  },

  // Model CRUD
  getModels: async () => {
    let conn;
    try {
      conn = await pool.connect();
      const sql = `
        SELECT vm.veh_model_id, vm.model_name, vm.veh_year_id, vy.year AS veh_year, vb.brand_id, vb.brand_name
        FROM vehicle_model vm
        LEFT JOIN vehicle_brand vb ON vb.model_id = vm.veh_model_id
        LEFT JOIN vehicle_year vy ON vm.veh_year_id = vy.veh_year_id
        ORDER BY vb.brand_name ASC, vm.model_name ASC
      `;
      const { rows } = await conn.query(sql);
      return { isError: false, data: rows, errorMessage: "" };
    } catch (error) {
      return { isError: true, data: [], errorMessage: error.message };
    } finally {
      if (conn) conn.release();
    }
  },

  addModel: async (data) => {
    let conn;
    try {
      conn = await pool.connect();
      await conn.query("BEGIN");
      
      const brandRes = await conn.query("SELECT brand_name FROM vehicle_brand WHERE brand_id = $1", [data.brand_id]);
      const brandName = brandRes.rows[0]?.brand_name || '';

      const sqlModel = "INSERT INTO vehicle_model (model_name, veh_year_id) VALUES ($1, $2) RETURNING veh_model_id";
      const modelRes = await conn.query(sqlModel, [data.model_name, data.veh_year_id || null]);
      const newModelId = modelRes.rows[0].veh_model_id;

      const sqlBrand = "INSERT INTO vehicle_brand (brand_name, model_id) VALUES ($1, $2)";
      await conn.query(sqlBrand, [brandName, newModelId]);

      await conn.query("COMMIT");
      return { isError: false, data: { veh_model_id: newModelId }, errorMessage: "" };
    } catch (error) {
      if (conn) await conn.query("ROLLBACK");
      return { isError: true, data: null, errorMessage: error.message };
    } finally {
      if (conn) conn.release();
    }
  },

  updateModel: async (data) => {
    let conn;
    try {
      conn = await pool.connect();
      await conn.query("BEGIN");

      const sqlModel = "UPDATE vehicle_model SET model_name = $1, veh_year_id = $2 WHERE veh_model_id = $3";
      await conn.query(sqlModel, [data.model_name, data.veh_year_id || null, data.veh_model_id]);

      const brandRes = await conn.query("SELECT brand_name FROM vehicle_brand WHERE brand_id = $1", [data.brand_id]);
      const brandName = brandRes.rows[0]?.brand_name || '';

      const checkBrand = await conn.query("SELECT brand_id FROM vehicle_brand WHERE model_id = $1", [data.veh_model_id]);
      if (checkBrand.rows.length > 0) {
        await conn.query("UPDATE vehicle_brand SET brand_name = $1 WHERE model_id = $2", [brandName, data.veh_model_id]);
      } else {
        await conn.query("INSERT INTO vehicle_brand (brand_name, model_id) VALUES ($1, $2)", [brandName, data.veh_model_id]);
      }

      await conn.query("COMMIT");
      return { isError: false, message: "อัปเดตรุ่นรถยนต์สำเร็จ", errorMessage: "" };
    } catch (error) {
      if (conn) await conn.query("ROLLBACK");
      return { isError: true, errorMessage: error.message };
    } finally {
      if (conn) conn.release();
    }
  },

  deleteModel: async (modelId) => {
    let conn;
    try {
      conn = await pool.connect();
      const sql = "DELETE FROM vehicle_model WHERE veh_model_id = $1";
      await conn.query(sql, [modelId]);
      return { isError: false, message: "ลบรุ่นรถยนต์สำเร็จ", errorMessage: "" };
    } catch (error) {
      return { isError: true, errorMessage: error.message };
    } finally {
      if (conn) conn.release();
    }
  },

  // Year CRUD
  getYears: async () => {
    let conn;
    try {
      conn = await pool.connect();
      const sql = "SELECT MIN(veh_year_id) AS veh_year_id, year FROM vehicle_year GROUP BY year ORDER BY year DESC";
      const { rows } = await conn.query(sql);
      return { isError: false, data: rows, errorMessage: "" };
    } catch (error) {
      return { isError: true, data: [], errorMessage: error.message };
    } finally {
      if (conn) conn.release();
    }
  },

  addYear: async (data) => {
    let conn;
    try {
      conn = await pool.connect();
      const sql = "INSERT INTO vehicle_year (year) VALUES ($1) RETURNING veh_year_id";
      const { rows } = await conn.query(sql, [data.year]);
      return { isError: false, data: rows[0], errorMessage: "" };
    } catch (error) {
      return { isError: true, data: null, errorMessage: error.message };
    } finally {
      if (conn) conn.release();
    }
  },

  updateYear: async (data) => {
    let conn;
    try {
      conn = await pool.connect();
      const sql = "UPDATE vehicle_year SET year = $1 WHERE veh_year_id = $2";
      await conn.query(sql, [data.year, data.veh_year_id]);
      return { isError: false, message: "อัปเดตปีรุ่นรถยนต์สำเร็จ", errorMessage: "" };
    } catch (error) {
      return { isError: true, errorMessage: error.message };
    } finally {
      if (conn) conn.release();
    }
  },

  deleteYear: async (yearId) => {
    let conn;
    try {
      conn = await pool.connect();
      const sql = "DELETE FROM vehicle_year WHERE veh_year_id = $1";
      await conn.query(sql, [yearId]);
      return { isError: false, message: "ลบปีรุ่นรถยนต์สำเร็จ", errorMessage: "" };
    } catch (error) {
      return { isError: true, errorMessage: error.message };
    } finally {
      if (conn) conn.release();
    }
  }
};
