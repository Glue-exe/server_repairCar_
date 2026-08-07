const pool = require("../libs/db_pool.js");

module.exports = {
  createVehicalIntake: async (req, res) => {
    const {
      cus_firstname,
      cus_lastname,
      cus_phone,
      veh_licenseplate,
      brand_id,
      veh_model,
      veh_color,
      veh_year,
    } = req.body;
   
    const current_emp_id = req.user?.emp_id ?? 4;

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const vehicleCheck = await client.query(
        "SELECT veh_id FROM vehicle WHERE veh_licenseplate = $1",
        [veh_licenseplate.trim()]
      );

      if (vehicleCheck.rows.length > 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          isError: true,
          errorMessage: `ทะเบียนรถ ${veh_licenseplate} มีอยู่ในระบบแล้ว ไม่สามารถเพิ่มซ้ำได้`,
        });
      }

      let customerId;
      const customerCheck = await client.query(
        "SELECT cus_id FROM customer WHERE cus_phone = $1",
        [cus_phone.trim()]
      );

      if (customerCheck.rows.length > 0) {
 
        customerId = customerCheck.rows[0].cus_id;
      } else {

        const insertCustomerQuery = `
          INSERT INTO customer (cus_firstname, cus_lastname, cus_phone, create_by_emp, title_id) 
          VALUES ($1, $2, $3, $4, $5) 
          RETURNING cus_id
        `;
        const customerResult = await client.query(insertCustomerQuery, [
          cus_firstname.trim(),
          cus_lastname.trim(),
          cus_phone.trim(),
          current_emp_id, 
          1 
        ]);
        customerId = customerResult.rows[0].cus_id;
      }

      const insertVehicleQuery = `
        INSERT INTO vehicle (customer_id, veh_licenseplate, brand_id, veh_model, veh_color, veh_year) 
        VALUES ($1, $2, $3, $4, $5, $6) 
        RETURNING veh_id
      `;
      const vehicleResult = await client.query(insertVehicleQuery, [
        customerId,
        veh_licenseplate.trim(),
        brand_id,
        veh_model.trim(),
        veh_color.trim(),
        veh_year.trim(),
      ]);

      await client.query("COMMIT");

      return res.status(201).json({
        isError: false,
        message: "บันทึกข้อมูลลูกค้าและรถยนต์สำเร็จ",
        data: {
          cus_id: customerId,
          veh_id: vehicleResult.rows[0].veh_id,
        },
      });

    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Database Error:", error);

      return res.status(500).json({
        isError: true,
        errorMessage: "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์ ไม่สามารถบันทึกข้อมูลได้",
      });
    } finally {
      client.release();
    }
  },
};
