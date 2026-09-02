const pool = require("../libs/db_pool.js");

module.exports = {
  // Brand CRUD
  getBrands: async () => {
    let conn;
    try {
      conn = await pool.connect();
      const sql = "SELECT vb_id, vb_id AS id, vb_id AS brand_id, vb_name, vb_name AS name, vb_name AS brand_name FROM vehicle_brand ORDER BY vb_name ASC";
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
      const sql = "INSERT INTO vehicle_brand (vb_name) VALUES ($1) RETURNING vb_id AS brand_id, vb_id AS id, vb_name AS brand_name, vb_name AS name";
      const { rows } = await conn.query(sql, [data.brand_name || data.vb_name || data.name]);
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
      const brandId = data.brand_id || data.vb_id || data.id;
      const brandName = data.brand_name || data.vb_name || data.name;
      const sql = "UPDATE vehicle_brand SET vb_name = $1 WHERE vb_id = $2";
      await conn.query(sql, [brandName, brandId]);
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
      const sql = "DELETE FROM vehicle_brand WHERE vb_id = $1";
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
        SELECT 
          vm.vm_id AS veh_model_id, 
          vm.vm_id AS id, 
          vm.vm_name AS model_name, 
          vm.vm_name AS name, 
          vb.vb_id AS brand_id, 
          vb.vb_name AS brand_name
        FROM vehicle_model vm
        LEFT JOIN vehicle_brand vb ON vm.vm_brand_id = vb.vb_id
        ORDER BY vb.vb_name ASC, vm.vm_name ASC
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
      const sqlModel = "INSERT INTO vehicle_model (vm_name, vm_brand_id) VALUES ($1, $2) RETURNING vm_id AS veh_model_id, vm_id AS id";
      const modelRes = await conn.query(sqlModel, [
        data.model_name || data.vm_name || data.name, 
        data.brand_id || data.vm_brand_id || data.vb_id
      ]);
      return { isError: false, data: { veh_model_id: modelRes.rows[0].id, id: modelRes.rows[0].id }, errorMessage: "" };
    } catch (error) {
      return { isError: true, data: null, errorMessage: error.message };
    } finally {
      if (conn) conn.release();
    }
  },

  updateModel: async (data) => {
    let conn;
    try {
      conn = await pool.connect();
      const modelId = data.veh_model_id || data.vm_id || data.id;
      const modelName = data.model_name || data.vm_name || data.name;
      const brandId = data.brand_id || data.vm_brand_id || data.vb_id;
      const sql = "UPDATE vehicle_model SET vm_name = $1, vm_brand_id = $2 WHERE vm_id = $3";
      await conn.query(sql, [modelName, brandId, modelId]);
      return { isError: false, message: "อัปเดตรุ่นรถยนต์สำเร็จ", errorMessage: "" };
    } catch (error) {
      return { isError: true, errorMessage: error.message };
    } finally {
      if (conn) conn.release();
    }
  },

  deleteModel: async (modelId) => {
    let conn;
    try {
      conn = await pool.connect();
      const sql = "DELETE FROM vehicle_model WHERE vm_id = $1";
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
      const sql = "SELECT DISTINCT v_year AS veh_year_id, v_year AS year FROM vehicle WHERE v_year IS NOT NULL ORDER BY v_year DESC";
      const { rows } = await conn.query(sql);
      return { isError: false, data: rows, errorMessage: "" };
    } catch (error) {
      return { isError: true, data: [], errorMessage: error.message };
    } finally {
      if (conn) conn.release();
    }
  },

  addYear: async (data) => {
    return { isError: false, data: { veh_year_id: data.year, year: data.year }, errorMessage: "" };
  },

  updateYear: async (data) => {
    return { isError: false, message: "อัปเดตปีรุ่นรถยนต์สำเร็จ", errorMessage: "" };
  },

  deleteYear: async (yearId) => {
    return { isError: false, message: "ลบปีรุ่นรถยนต์สำเร็จ", errorMessage: "" };
  }
};
