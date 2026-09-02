const pool = require("../libs/db_pool.js");

async function resolveModelId(client, brandInput, modelInput) {
  let brandName = '';
  let brandId = null;

  if (brandInput && (typeof brandInput === 'number' || !isNaN(brandInput))) {
    const res = await client.query("SELECT vb_id AS id, vb_name AS name FROM vehicle_brand WHERE vb_id = $1", [parseInt(brandInput)]);
    if (res.rows.length > 0) {
      brandId = res.rows[0].id;
      brandName = res.rows[0].name;
    }
  }

  if (!brandId) {
    brandName = (brandInput || 'ไม่ระบุยี่ห้อ').toString().trim();
    let bRes = await client.query("SELECT vb_id AS id FROM vehicle_brand WHERE TRIM(vb_name) ILIKE $1", [brandName]);
    if (bRes.rows.length > 0) {
      brandId = bRes.rows[0].id;
    } else {
      const insBrand = await client.query("INSERT INTO vehicle_brand (vb_name) VALUES ($1) RETURNING vb_id AS id", [brandName]);
      brandId = insBrand.rows[0].id;
    }
  }

  const cleanModelName = (modelInput || 'ไม่ระบุรุ่น').toString().trim();
  let modelRes = await client.query("SELECT vm_id AS id FROM vehicle_model WHERE TRIM(vm_name) ILIKE $1 AND vm_brand_id = $2", [cleanModelName, brandId]);
  let modelId;
  if (modelRes.rows.length > 0) {
    modelId = modelRes.rows[0].id;
  } else {
    const insModel = await client.query("INSERT INTO vehicle_model (vm_name, vm_brand_id) VALUES ($1, $2) RETURNING vm_id AS id", [cleanModelName, brandId]);
    modelId = insModel.rows[0].id;
  }

  return modelId;
}

module.exports = {
  getCustomerById: async (cus_id) => {
    let conn;
    try {
      conn = await pool.connect();
      const sql = ` 
        SELECT 
          cus_id,
          cus_id AS id, 
          cus_title_id AS title_id, 
          cus_first_name AS cus_firstname, 
          cus_first_name AS first_name, 
          cus_last_name AS cus_lastname, 
          cus_last_name AS last_name, 
          cus_phone AS cus_phone, 
          cus_phone AS phone 
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
          v.v_id AS veh_id, 
          v.v_id AS id, 
          v.v_license_plate AS veh_licenseplate, 
          v.v_license_plate AS license_plate, 
          vb.vb_id AS brand_id,
          vb.vb_name AS brand_name,
          vm.vm_id AS veh_model_id,
          vm.vm_name AS veh_model,
          vm.vm_name AS model_name,
          v.v_year AS veh_year,
          v.v_year AS year,
          v.v_color AS veh_color,
          v.v_color AS color
        FROM vehicle v
        LEFT JOIN vehicle_model vm ON v.v_vehicle_model_id = vm.vm_id
        LEFT JOIN vehicle_brand vb ON vm.vm_brand_id = vb.vb_id
        WHERE v.v_customer_id = $1
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
    const firstName = cus_firstname || Data.first_name || '';
    const lastName = cus_lastname || Data.last_name || '';
    const phone = cus_phone || Data.phone || '';

    const sql = `
      INSERT INTO customer (cus_first_name, cus_last_name, cus_phone, cus_title_id)
      VALUES ($1, $2, $3, $4)
      RETURNING cus_id, cus_id AS id, cus_first_name AS cus_firstname, cus_first_name AS first_name, cus_last_name AS cus_lastname, cus_last_name AS last_name, cus_phone AS cus_phone, cus_phone AS phone
    `;
    const { rows } = await db.query(sql, [
      firstName.trim(),
      lastName.trim(),
      phone.trim(),
      title_id || Data.cus_title_id
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
   
    const current_account_id = req.user?.account_id ?? req.user?.acc_id ?? 1;
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // ตรวจสอบทะเบียนรถซ้ำ
      const plate = veh_licenseplate || req.body.license_plate || req.body.v_license_plate || '';
      const vehicleCheck = await client.query(
        "SELECT v_id AS id FROM vehicle WHERE v_license_plate = $1",
        [plate.trim()]
      );

      if (vehicleCheck.rows.length > 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          isError: true,
          errorMessage: `ทะเบียนรถ ${plate} มีอยู่ในระบบแล้ว ไม่สามารถเพิ่มซ้ำได้`,
        });
      }

      // ตรวจสอบ/เพิ่มข้อมูลลูกค้า
      let customerId;
      const phone = cus_phone || req.body.phone || req.body.cus_phone || '';
      const customerCheck = await client.query(
        "SELECT cus_id AS id FROM customer WHERE cus_phone = $1",
        [phone.trim()]
      );

      if (customerCheck.rows.length > 0) {
        customerId = customerCheck.rows[0].id;
      } else {
        const insertCustomerQuery = `
          INSERT INTO customer (cus_first_name, cus_last_name, cus_phone, cus_created_by_account_id, cus_title_id) 
          VALUES ($1, $2, $3, $4, $5) 
          RETURNING cus_id AS id
        `;
        const firstName = cus_firstname || req.body.first_name || req.body.cus_first_name || '';
        const lastName = cus_lastname || req.body.last_name || req.body.cus_last_name || '';
        const customerResult = await client.query(insertCustomerQuery, [
          firstName.trim(),
          lastName.trim(),
          phone.trim(),
          current_account_id, 
          1 
        ]);
        customerId = customerResult.rows[0].id;
      }

      const resolvedModelId = await resolveModelId(client, brand_id || req.body.vm_brand_id, veh_model || req.body.model_name || req.body.vm_name);

      const insertVehicleQuery = `
        INSERT INTO vehicle (v_customer_id, v_license_plate, v_vehicle_model_id, v_year, v_color) 
        VALUES ($1, $2, $3, $4, $5) 
        RETURNING v_id AS id
      `;
      const yearVal = parseInt(veh_year || req.body.year || req.body.v_year) || null;
      const colorVal = (veh_color || req.body.color || req.body.v_color || '').trim();

      const vehicleResult = await client.query(insertVehicleQuery, [
        customerId,
        plate.trim(),
        resolvedModelId,
        yearVal,
        colorVal,
      ]);

      await client.query("COMMIT");

      return res.status(201).json({
        isError: false,
        message: "บันทึกข้อมูลลูกค้าและรถยนต์สำเร็จ",
        data: {
          cus_id: customerId,
          veh_id: vehicleResult.rows[0].id,
          id: vehicleResult.rows[0].id,
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
      const plate = veh_licenseplate || req.body.license_plate || req.body.v_license_plate || '';
      // ตรวจสอบทะเบียนรถซ้ำ
      const plateCheck = await conn.query(
        "SELECT v_id AS id FROM vehicle WHERE v_license_plate = $1",
        [plate.trim()]
      );
      if (plateCheck.rows.length > 0) {
        return res.status(400).json({
          isError: true,
          errorMessage: `ทะเบียนรถ ${plate} มีอยู่ในระบบแล้ว`
        });
      }

      const resolvedModelId = await resolveModelId(conn, brand_id || req.body.vm_brand_id, veh_model || req.body.model_name || req.body.vm_name);

      const sql = `
        INSERT INTO vehicle (v_customer_id, v_license_plate, v_vehicle_model_id, v_year, v_color)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING v_id AS veh_id, v_id AS id
      `;
      const yearVal = parseInt(veh_year || req.body.year || req.body.v_year) || null;
      const colorVal = (veh_color || req.body.color || req.body.v_color || '').trim();

      const { rows } = await conn.query(sql, [
        customer_id || req.body.cus_id || req.body.v_customer_id,
        plate.trim(),
        resolvedModelId,
        yearVal,
        colorVal
      ]);

      return res.status(201).json({
        isError: false,
        message: "เพิ่มรถยนต์สำเร็จ",
        data: {
          veh_id: rows[0].id,
          id: rows[0].id
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
