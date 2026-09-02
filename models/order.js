const pool = require("../libs/db_pool.js");

module.exports = {
  addOrder: async (req, res) => {
    const { cus_id, veh_id, order_symptom, orders_priority_id, labor_cost } = req.body;
    const vehicle_id = veh_id || req.body.vehicle_id || req.body.v_id || req.body.o_vehicle_id;
    const account_id = req.user?.account_id ?? req.user?.acc_id ?? req.user?.emp_id ?? 1;
    const symptom = order_symptom || req.body.symptom || req.body.o_symptom || '';
    const priority_id = orders_priority_id || req.body.priority_id || req.body.o_priority_id || req.body.p_id || 1;
    const status_id = req.body.status_id || req.body.order_status_id || req.body.o_order_status_id || req.body.os_id || 1;

    let conn;
    try {
      conn = await pool.connect();
      const sql = `
        INSERT INTO orders (o_vehicle_id, o_symptom, o_order_status_id, o_priority_id, o_created_by_account_id)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING o_id, o_id AS id, o_id AS orders_id, o_id AS order_id
      `;
      const { rows } = await conn.query(sql, [
        vehicle_id,
        symptom.trim(),
        status_id,
        priority_id,
        account_id
      ]);

      return res.status(201).json({
        isError: false,
        message: "เปิดงานซ่อมสำเร็จ",
        data: {
          order_id: rows[0].o_id,
          orders_id: rows[0].o_id,
          id: rows[0].o_id
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
            o.o_id AS orders_id,
            o.o_id AS order_id,
            o.o_id AS id,
            v.v_customer_id AS cus_id,
            o.o_vehicle_id AS veh_id,
            o.o_vehicle_id AS vehicle_id,
            o.o_created_by_account_id AS emp_id,
            o.o_symptom AS order_symptom,
            o.o_symptom AS symptom,
            o.o_order_status_id AS status_id,
            o.o_order_status_id AS order_status_id,
            o.o_priority_id AS orders_priority_id,
            o.o_priority_id AS priority_id,
            o.o_created_at AS created_at,
            o.o_updated_at AS updated_at,
            c.cus_first_name AS cus_firstname,
            c.cus_last_name AS cus_lastname,
            c.cus_phone AS cus_phone,
            v.v_license_plate AS veh_licenseplate,
            v.v_color AS veh_color,
            vb.vb_name AS brand_name,
            vm.vm_name AS model_name,
            v.v_year AS veh_year
        FROM orders o
        JOIN vehicle v ON o.o_vehicle_id = v.v_id
        JOIN customer c ON v.v_customer_id = c.cus_id
        LEFT JOIN vehicle_model vm ON v.v_vehicle_model_id = vm.vm_id
        LEFT JOIN vehicle_brand vb ON vm.vm_brand_id = vb.vb_id
        ORDER BY o.o_created_at DESC
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
