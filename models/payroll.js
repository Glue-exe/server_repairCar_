const pool = require("../libs/db_pool.js");

module.exports = {
  // ดึงรายการเงินเดือนประจำเดือน (Monthly Payroll) พร้อมสรุปภาพรวม
  getMonthlyPayroll: async ({ month, role_id = 3 }) => {
    let conn;
    try {
      conn = await pool.connect();

      // ถ้าระบุ month ไม่ครบ ให้ใช้เดือนปัจจุบัน
      const targetMonth = month || new Date().toISOString().slice(0, 7);
      const roleFilter = role_id && role_id !== "all" ? parseInt(role_id, 10) : null;

      const sql = `
        SELECT 
          e.emp_id,
          e.emp_first_name AS first_name,
          e.emp_last_name AS last_name,
          CONCAT(COALESCE(t.t_name, ''), e.emp_first_name, ' ', e.emp_last_name) AS full_name,
          e.emp_phone AS phone,
          e.emp_current_salary::FLOAT AS base_salary,
          r.ar_id AS role_id,
          COALESCE(r.ar_name, 'พนักงาน') AS role_name,
          sh.sh_id AS salary_history_id,
          CASE WHEN sh.sh_id IS NOT NULL THEN true ELSE false END AS is_paid,
          COALESCE(sh.sh_salary_amount, e.emp_current_salary)::FLOAT AS paid_amount,
          sh.sh_effective_date::text AS paid_date,
          sh.sh_payment_method_id AS payment_method_id,
          CASE 
            WHEN sh.sh_payment_method_id = 2 THEN 'โอนเงิน'
            WHEN sh.sh_payment_method_id = 1 THEN 'เงินสด'
            ELSE NULL
          END AS payment_method_name,
          sh.sh_slip_image AS slip_image_url,
          sh.sh_created_at::text AS paid_at
        FROM employee e
        INNER JOIN title t ON e.emp_title_id = t.t_id
        LEFT JOIN account a ON e.emp_id = a.acc_employee_id
        LEFT JOIN account_role r ON a.acc_role_id = r.ar_id
        LEFT JOIN salary_history sh 
          ON e.emp_id = sh.sh_emp_id 
         AND TO_CHAR(sh.sh_effective_date, 'YYYY-MM') = $1
        WHERE e.deleted_at IS NULL
          AND ($2::int IS NULL OR r.ar_id = $2)
        ORDER BY e.emp_id ASC;
      `;

      const { rows } = await conn.query(sql, [targetMonth, roleFilter]);

      let totalPayout = 0;
      let paidTotalAmount = 0;
      let paidCount = 0;
      let pendingTotalAmount = 0;
      let pendingCount = 0;

      rows.forEach((item) => {
        if (item.is_paid) {
          paidCount += 1;
          paidTotalAmount += item.paid_amount;
          totalPayout += item.paid_amount;
        } else {
          pendingCount += 1;
          pendingTotalAmount += item.base_salary;
          totalPayout += item.base_salary;
        }
      });

      return {
        isError: false,
        data: {
          month: targetMonth,
          summary: {
            total_payout: totalPayout,
            paid_count: paidCount,
            paid_total_amount: paidTotalAmount,
            pending_count: pendingCount,
            pending_total_amount: pendingTotalAmount,
            total_technicians: rows.length,
          },
          technicians: rows,
        },
        errorMessage: "",
      };
    } catch (error) {
      console.error("Database Error in getMonthlyPayroll:", error);
      return {
        isError: true,
        data: null,
        errorMessage: error.message,
      };
    } finally {
      if (conn) conn.release();
    }
  },

  // บันทึกการจ่ายเงินเดือนช่าง (พร้อมสลิป)
  paySalary: async ({
    emp_id,
    salary_amount,
    effective_date,
    payment_method_id = 1,
    slip_image = null,
    account_id = 1,
  }) => {
    let conn;
    try {
      conn = await pool.connect();
      await conn.query("BEGIN");

      const dateStr = effective_date || new Date().toISOString().slice(0, 10);
      const targetMonth = dateStr.slice(0, 7);

      // ตรวจสอบว่ามีประวัติจ่ายในเดือนนี้อยู่แล้วหรือไม่
      const checkSql = `
        SELECT sh_id, sh_slip_image 
        FROM salary_history 
        WHERE sh_emp_id = $1 
          AND TO_CHAR(sh_effective_date, 'YYYY-MM') = $2
        LIMIT 1;
      `;
      const checkRes = await conn.query(checkSql, [emp_id, targetMonth]);

      let resultId;
      if (checkRes.rows.length > 0) {
        // อัปเดตรายการเดิมที่มีอยู่
        const existingId = checkRes.rows[0].sh_id;
        const updateSql = `
          UPDATE salary_history
          SET 
            sh_salary_amount = $1,
            sh_effective_date = $2,
            sh_payment_method_id = $3,
            sh_slip_image = COALESCE($4, sh_slip_image),
            sh_created_by_account_id = $5,
            sh_created_at = CURRENT_TIMESTAMP
          WHERE sh_id = $6
          RETURNING *;
        `;
        const updateRes = await conn.query(updateSql, [
          salary_amount,
          dateStr,
          payment_method_id,
          slip_image,
          account_id,
          existingId,
        ]);
        resultId = updateRes.rows[0].sh_id;
      } else {
        // เพิ่มรายการใหม่
        const insertSql = `
          INSERT INTO salary_history (
            sh_emp_id,
            sh_salary_amount,
            sh_effective_date,
            sh_payment_method_id,
            sh_slip_image,
            sh_created_by_account_id,
            sh_created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
          RETURNING *;
        `;
        const insertRes = await conn.query(insertSql, [
          emp_id,
          salary_amount,
          dateStr,
          payment_method_id,
          slip_image,
          account_id,
        ]);
        resultId = insertRes.rows[0].sh_id;
      }

      await conn.query("COMMIT");

      return {
        isError: false,
        data: {
          salary_history_id: resultId,
          emp_id,
          salary_amount,
          effective_date: dateStr,
          slip_image,
          message: "บันทึกการจ่ายเงินเดือนสำเร็จ",
        },
        errorMessage: "",
      };
    } catch (error) {
      if (conn) await conn.query("ROLLBACK");
      console.error("Database Error in paySalary:", error);
      return {
        isError: true,
        data: null,
        errorMessage: error.message,
      };
    } finally {
      if (conn) conn.release();
    }
  },

  // ดึงประวัติการรับเงินเดือนย้อนหลังของช่างคนใดคนหนึ่ง
  getEmployeeSalaryHistory: async (empId) => {
    let conn;
    try {
      conn = await pool.connect();
      const sql = `
        SELECT 
          sh.sh_id,
          sh.sh_salary_amount::FLOAT AS salary_amount,
          sh.sh_effective_date::text AS effective_date,
          sh.sh_payment_method_id AS payment_method_id,
          CASE 
            WHEN sh.sh_payment_method_id = 2 THEN 'โอนเงิน'
            WHEN sh.sh_payment_method_id = 1 THEN 'เงินสด'
            ELSE 'ไม่ระบุ'
          END AS payment_method_name,
          sh.sh_slip_image AS slip_image_url,
          sh.sh_created_at::text AS created_at,
          CONCAT(COALESCE(t.t_name, ''), e.emp_first_name, ' ', e.emp_last_name) AS full_name
        FROM salary_history sh
        JOIN employee e ON sh.sh_emp_id = e.emp_id
        LEFT JOIN title t ON e.emp_title_id = t.t_id
        WHERE sh.sh_emp_id = $1
        ORDER BY sh.sh_effective_date DESC;
      `;
      const { rows } = await conn.query(sql, [empId]);
      return {
        isError: false,
        data: rows,
        errorMessage: "",
      };
    } catch (error) {
      console.error("Database Error in getEmployeeSalaryHistory:", error);
      return {
        isError: true,
        data: [],
        errorMessage: error.message,
      };
    } finally {
      if (conn) conn.release();
    }
  },
};
