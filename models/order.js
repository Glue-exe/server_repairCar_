const pool = require("../libs/db_pool.js");

module.exports = {
  addOrder: async (req, res) => {
    const { cus_id, veh_id, order_symptom, orders_priority_id, labor_cost } = req.body;
    const emp_id = req.user?.emp_id ?? 4;
    let conn;
    try {
      conn = await pool.connect();
      const sql = `
        INSERT INTO orders (cus_id, veh_id, emp_id, order_symptom, status_id, orders_priority_id, labor_cost, "repair time")
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING orders_id
      `;
      const { rows } = await conn.query(sql, [
        cus_id,
        veh_id,
        emp_id,
        order_symptom.trim(),
        1, // status_id: 1 (รับรถ)
        orders_priority_id,
        labor_cost ? parseFloat(labor_cost) : null,
        null
      ]);

      return res.status(201).json({
        isError: false,
        message: "เปิดงานซ่อมสำเร็จ",
        data: {
          order_id: rows[0].orders_id
        }
      });
    } catch (error) {
      console.error("Database Error in addOrder:", error);
      return res.status(500).json({
        isError: true,
        errorMessage: "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์ ไม่สามารถเปิดงานซ่อมได้"
      });
    } finally {
      if (conn) conn.release();
    }
  },

  getOrders: async (req, res) => {
    let conn;
    try {
      conn = await pool.connect();
      const sql = `
        SELECT 
            o.orders_id,
            o.cus_id,
            o.veh_id,
            o.emp_id,
            o.order_symptom,
            o.status_id,
            o.orders_priority_id,
            o.labor_cost,
            o."repair time" AS repair_time,
            o.created_at,
            c.cus_firstname,
            c.cus_lastname,
            c.cus_phone,
            v.veh_licenseplate,
            v.veh_color,
            vb.brand_name,
            vm.model_name,
            vy.year AS veh_year
        FROM orders o
        LEFT JOIN customer c ON o.cus_id = c.cus_id
        LEFT JOIN vehicle v ON o.veh_id = v.veh_id
        LEFT JOIN vehicle_brand vb ON v.brand_id = vb.brand_id
        LEFT JOIN vehicle_model vm ON vb.model_id = vm.veh_model_id
        LEFT JOIN vehicle_year vy ON vm.veh_year_id = vy.veh_year_id
        ORDER BY o.created_at DESC
      `;
      const { rows } = await conn.query(sql);
      return res.status(200).json({
        isError: false,
        data: rows
      });
    } catch (error) {
      console.error("Database Error in getOrders:", error);
      return res.status(500).json({
        isError: true,
        errorMessage: "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์ ไม่สามารถดึงข้อมูลงานได้"
      });
    } finally {
      if (conn) conn.release();
    }
  }
};
