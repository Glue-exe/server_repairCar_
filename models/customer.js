const pool = require("../libs/db_pool.js");

async function resolveBrandId(client, brandInput, modelName, yearValue) {
  let brandName = '';
  if (brandInput && (typeof brandInput === 'number' || !isNaN(brandInput))) {
    const res = await client.query("SELECT brand_name FROM vehicle_brand WHERE brand_id = $1", [parseInt(brandInput)]);
    brandName = res.rows[0]?.brand_name || '';
  } else {
    brandName = (brandInput || '').toString().trim();
  }
  if (!brandName) brandName = 'ไม่ระบุ';

  const yearInt = parseInt(yearValue) || 2020;
  let yearRes = await client.query("SELECT veh_year_id FROM vehicle_year WHERE year = $1", [yearInt]);
  let yearId;
  if (yearRes.rows.length > 0) {
    yearId = yearRes.rows[0].veh_year_id;
  } else {
    const ins = await client.query("INSERT INTO vehicle_year (year) VALUES ($1) RETURNING veh_year_id", [yearInt]);
    yearId = ins.rows[0].veh_year_id;
  }

  const cleanModelName = (modelName || 'ไม่ระบุรุ่น').toString().trim();
  let modelRes = await client.query("SELECT veh_model_id FROM vehicle_model WHERE TRIM(model_name) ILIKE $1 AND veh_year_id = $2", [cleanModelName, yearId]);
  let modelId;
  if (modelRes.rows.length > 0) {
    modelId = modelRes.rows[0].veh_model_id;
  } else {
    const ins = await client.query("INSERT INTO vehicle_model (model_name, veh_year_id) VALUES ($1, $2) RETURNING veh_model_id", [cleanModelName, yearId]);
    modelId = ins.rows[0].veh_model_id;
  }

  let brandRes = await client.query("SELECT brand_id FROM vehicle_brand WHERE TRIM(brand_name) ILIKE $1 AND model_id = $2", [brandName, modelId]);
  let brandId;
  if (brandRes.rows.length > 0) {
    brandId = brandRes.rows[0].brand_id;
  } else {
    const ins = await client.query("INSERT INTO vehicle_brand (brand_name, model_id) VALUES ($1, $2) RETURNING brand_id", [brandName, modelId]);
    brandId = ins.rows[0].brand_id;
  }

  return brandId;
}

module.exports = {
  getCustomerById: async (cus_id) => {
    let conn;
    try {
      conn = await pool.connect();
      const sql = ` 
        SELECT cus_id, title_id, cus_firstname, cus_lastname, cus_phone 
        FROM customer
        WHERE cus_id = $1
      `;
      const { rows } = await conn.query(sql, [cus_id]);
      return { isError: false, data: rows, errorMessage: "" };
    } catch (error) {
      return { isError: true, data: "", errorMessage: error.message };
    } finally {
      if (conn) conn.release();
    }
  },

  getVehiclesByCustomerId: async (cus_id) => {
    let conn;
    try {
      conn = await pool.connect();
      const sql = ` 
        SELECT 
          v.veh_id, 
          v.veh_licenseplate, 
          v.brand_id,
          vb.brand_name,
          vb.model_id AS veh_model_id,
          vm.model_name AS veh_model,
          vm.veh_year_id AS model_year_id,
          vy.year AS veh_year,
          v.veh_color
        FROM vehicle v
        LEFT JOIN vehicle_brand vb ON v.brand_id = vb.brand_id
        LEFT JOIN vehicle_model vm ON vb.model_id = vm.veh_model_id
        LEFT JOIN vehicle_year vy ON vm.veh_year_id = vy.veh_year_id
        WHERE v.customer_id = $1
      `;
      const { rows } = await conn.query(sql, [cus_id]);
      return { isError: false, data: rows, errorMessage: "" };
    } catch (error) {
      return { isError: true, data: "", errorMessage: error.message };
    } finally {
      if (conn) conn.release();
    }
  },

  addCustomer: async (Data, client = null) => {
    const db = client || pool;
    const { cus_firstname, cus_lastname, cus_phone, title_id = null } = Data;
    const sql = `
      INSERT INTO customer (cus_firstname, cus_lastname, cus_phone, title_id)
      VALUES ($1, $2, $3, $4)
      RETURNING cus_id, cus_firstname, cus_lastname, cus_phone
    `;
    const { rows } = await db.query(sql, [
      cus_firstname.trim(),
      cus_lastname.trim(),
      cus_phone.trim(),
      title_id
    ]);
    return rows[0];
  },

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

      // ตรวจสอบทะเบียนรถซ้ำ
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

      // ตรวจสอบ/เพิ่มข้อมูลลูกค้า
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

      // ค้นหาหรือสร้าง brand_id จริงที่ผูกกับชื่อยี่ห้อ ชื่อรุ่น และปีรุ่นตามที่ส่งมา
      const resolvedBrandId = await resolveBrandId(client, brand_id, veh_model, veh_year);

      // บันทึกข้อมูลรถยนต์ด้วยข้อมูลที่มีในตารางจริง
      const insertVehicleQuery = `
        INSERT INTO vehicle (customer_id, veh_licenseplate, brand_id, veh_color) 
        VALUES ($1, $2, $3, $4) 
        RETURNING veh_id
      `;
      const vehicleResult = await client.query(insertVehicleQuery, [
        customerId,
        veh_licenseplate.trim(),
        resolvedBrandId,
        veh_color.trim(),
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

  addVehicle: async (req, res) => {
    const { customer_id, veh_licenseplate, brand_id, veh_model, veh_year, veh_color } = req.body;
    let conn;
    try {
      conn = await pool.connect();
      // ตรวจสอบทะเบียนรถซ้ำ
      const plateCheck = await conn.query(
        "SELECT veh_id FROM vehicle WHERE veh_licenseplate = $1",
        [veh_licenseplate.trim()]
      );
      if (plateCheck.rows.length > 0) {
        return res.status(400).json({
          isError: true,
          errorMessage: `ทะเบียนรถ ${veh_licenseplate} มีอยู่ในระบบแล้ว`
        });
      }

      // ค้นหาหรือสร้าง brand_id จริงที่ผูกกับชื่อยี่ห้อ ชื่อรุ่น และปีรุ่นตามที่ส่งมา
      const resolvedBrandId = await resolveBrandId(conn, brand_id, veh_model, veh_year);

      const sql = `
        INSERT INTO vehicle (customer_id, veh_licenseplate, brand_id, veh_color)
        VALUES ($1, $2, $3, $4)
        RETURNING veh_id
      `;
      const { rows } = await conn.query(sql, [
        customer_id,
        veh_licenseplate.trim(),
        resolvedBrandId,
        veh_color.trim()
      ]);

      return res.status(201).json({
        isError: false,
        message: "เพิ่มรถยนต์สำเร็จ",
        data: {
          veh_id: rows[0].veh_id
        }
      });
    } catch (error) {
      return res.status(500).json({
        isError: true,
        errorMessage: error.message
      });
    } finally {
      if (conn) conn.release();
    }
  },
};
