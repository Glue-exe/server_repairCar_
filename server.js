const { log, error } = require("console");
const bp = require("body-parser");
const express = require("express");
const http = require("http");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const userAccountModel = require("./models/user_account");
const jwt = require("./libs/jwt");
const dateUtils = require("./libs/date_utils.js");
const { buildImageName } = require("./libs/image_name.js");
const dashboardModel = require("./models/dashboard.js");
const incomeModel = require("./models/income.js");
const empModel = require("./models/employee.js");
// [LEGACY] ย้ายไป models/old/vehicle_search.js แล้ว — ไม่ถูกโหลด (ปิด route /api/vehicle ด้านล่าง)
// const vehiclessearch = require("./models/old/vehicle_search.js");
const addnewcustomer = require("./models/customer.js");
const orderModel = require("./models/order.js");
const titleModel = require("./models/title.js");
const userRoleModel = require("./models/user_role.js");
const partModel = require("./models/part.js");
const vehicleModel = require("./models/vehicle.js"); // [vehicle] ยี่ห้อ/รุ่นรถ (ข้อมูลหลัก)

const vehicleSearchModel = require("./models/vehicle_search.js");
const order2Model = require("./models/order2.js");
const order3Model = require("./models/order3.js"); // [order3] โมเดลศูนย์รวมงานซ่อม (Order Center)
const serviceModel = require("./models/service.js");
const subTaskModel = require("./models/sub_task.js");
const vehicleRepairCategoryModel = require("./models/vehicle_repair_category.js");
const partRequisitionModel = require("./models/part_requisition.js");
const invoice2Model = require("./models/invoice2.js"); // [invoice2] บิลแบบ live (หัวบิลใช้ตาราง invoice)
const paymentMethodModel = require("./models/payment_method.js");
const paymentStatusModel = require("./models/payment_status.js");
const priorityModel = require("./models/priority.js");
const orderStatusModel = require("./models/order_status.js");
const salaryHistoryModel = require("./models/salary_history.js");

const app = express();

app.use(bp.urlencoded({ limit: "50mb", extended: true }));
app.use(bp.json({ limit: "50mb" }));
const cors = require("cors");
app.use(cors());

// uploads
app.use("/images", express.static("uploads"));

// ขนาดไฟล์รูปสูงสุดที่รับได้ (5 MB)
const IMAGE_MAX_SIZE = 5 * 1024 * 1024;

// ชนิดไฟล์รูปที่รับได้
const IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];

// สร้าง multer สำหรับ entity หนึ่งๆ — ตั้งชื่อไฟล์ตาม convention ของ entity นั้น
const makeUpload = (entity) => {
  const storage = multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, "uploads/");
    },
    filename: function (req, file, cb) {
      cb(null, buildImageName(entity, file.originalname));
    },
  });

  return multer({
    storage: storage,
    limits: { fileSize: IMAGE_MAX_SIZE },
    fileFilter: function (req, file, cb) {
      if (IMAGE_MIME_TYPES.includes(file.mimetype)) {
        cb(null, true);
        return;
      }
      cb(new Error("รองรับเฉพาะไฟล์รูปภาพ jpeg / png / webp"));
    },
  });
};

const uploadOrder = makeUpload("order");
const uploadPart = makeUpload("part");
const uploadInvoice = makeUpload("invoice");
const uploadService = makeUpload("service");

// ห่อ multer ให้คืน envelope แทนการโยน error ออกไป (ไฟล์ใหญ่เกิน / ชนิดไฟล์ไม่รับ)
const runImageUpload = (uploadMiddleware) => {
  return (req, res, next) => {
    uploadMiddleware(req, res, (error) => {
      if (error) {
        const errorMessage =
          error.code === "LIMIT_FILE_SIZE"
            ? "ไฟล์รูปใหญ่เกิน 5 MB"
            : error.message;
        res.json({
          isError: true,
          data: null,
          errorMessage: errorMessage,
        });
        return;
      }
      next();
    });
  };
};

app.get("/api/users", (req, res) => {
  var response = {
    isError: true,
    data: "You are unauthorized for this data",
  };

  res.send(JSON.stringify(response)); // แปลง jsObj เป็น JSON
});

app.post("/api/multiple_by_2", (req, res) => {
  var response = {
    isError: false,
    data: {
      no1: req.body.no_1 * 1,
      no2: req.body.no_2 * 2,
    },
  };
  res.send(JSON.stringify(response));
});

app.get("/api/user/:userId", async (req, res) => {
  const userId = req.params.userId; //.params เก็บข้อมูลที่ได้จาก URL มาเป็น jsObj
  const response = await userAccountModel.getUserAccountById(userId);
  res.send(JSON.stringify(response));
});

app.post("/api/authen/authen_request", async (req, res) => {
  console.log("authenRequestString: " + req.body.authen_request);
  const authenRequest = req.body.authen_request;
  const result = await userAccountModel.checkAuthenRequest(authenRequest);
  console.log(result);

  if (result.isError) {
    response = {
      isError: true,
      data: "",
      errorMessage: result.errorMessage,
    };
  } else {
    var payload = {
      username: result.data[0].account_username, // เอาข้อมูลจาก result ทั้งหมดของคนแรกและเอาแค่ account_username
    };
    const authenToken = jwt.sign(payload);
    response = {
      isError: false,
      data: authenToken,
      errorMessage: "",
    };
  }

  res.send(JSON.stringify(response));
});

app.post("/api/authen/access_request", async (req, res) => {
  const authenSignature = req.body.authen_signature;
  const authenToken = req.body.authen_token;

  let response;
  let decode;

  try {
    decode = await jwt.verify(authenToken);
  } catch (err) {
    decode = null;
  }

  if (decode) {
    const result = await userAccountModel.checkAccessRequest(
      authenSignature,
      authenToken,
    );
    console.log("result verify token: " + result);

    if (result.isError) {
      response = {
        isError: true,
        data: "",
        errorMessage: result.errorMessage,
      };
    } else {
      var payload = {
        user_id: result.data[0].user_id,
        username: result.data[0].account_username,
        emp_id: result.data[0].emp_id,
        firstname: result.data[0].firstname,
        lastname: result.data[0].lastname,
        full_name: result.data[0].full_name,
        role_name: result.data[0].user_role_name,
        role_id: result.data[0].user_role_id,
        date: dateUtils.getCurrentDateForToken(),
      };
      const accessToken = jwt.sign(payload);
      response = {
        isError: false,
        data: {
          access_token: accessToken,
          user_id: result.data[0].user_id,
          account_id: result.data[0].account_id,
          role_name: result.data[0].user_role_name,
          role_id: result.data[0].user_role_id,
          full_name: result.data[0].full_name,
        },
        errorMessage: "",
      };
    }
  } else {
    response = {
      isError: true,
      data: "",
      errorMessage: "ข้อมูลไม่ถูกต้อง",
    };
  }

  res.send(JSON.stringify(response));
});

const checkAccessToken = (req, res, next) => {
  let token = null;

  if (
    req.headers.authorization &&
    req.headers.authorization.split(" ")[0] === "Bearer"
  ) {
    token = req.headers.authorization.split(" ")[1];
  } else if (req.query && req.query.token) {
    token = req.query.token;
  } else if (req.body && req.body.token) {
    token = req.body.token;
  }

  jwt.verify(token).then(
    (decode) => {
      req.decode = decode;
      req.user = decode;
      next();
    },
    (err) => {
      res.json({
        isError: true,
        data: [],
        errorMessage: "ยังไม่ได้เข้าสู่ระบบ",
      });
    },
  );
};

app.get("/api/dashboard/summary", async (req, res) => {
  const response = await dashboardModel.getSummaryData();
  res.json(response);
});

app.get("/api/income/monthly_history", checkAccessToken, async (req, res) => {
  const response = await incomeModel.getMonthlyIncomeHistory();
  res.json(response);
});

app.get("/api/get_employee", async (req, res) => {
  const response = await empModel.getEmployee();
  res.json(response);
});

// [LEGACY] ปิด route /api/vehicle — หน้าจอที่เรียกถูกย้ายไป lib/screens/owner/intakecar(old)/ แล้ว
// app.get("/api/vehicle", checkAccessToken, async (req, res) => {
//   const searchVehicalOrCustomer = req.query.searchVehicalOrCustomer;
//   const response = await vehiclessearch.searchVehicalOrCustomer(
//     searchVehicalOrCustomer,
//   );
//   res.json(response);
// });

app.post("/api/addnewcustomer", checkAccessToken, async (req, res) => {
  await addnewcustomer.createVehicalIntake(req, res);
});

app.post("/api/addvehicle", checkAccessToken, async (req, res) => {
  await addnewcustomer.addVehicle(req, res);
});

app.post("/api/addorder", checkAccessToken, async (req, res) => {
  await orderModel.addOrder(req, res);
});

app.get("/api/orders", checkAccessToken, async (req, res) => {
  await orderModel.getOrders(req, res);
});

app.get("/api/title", checkAccessToken, async (req, res) => {
  const response = await titleModel.getTitle();
  res.json(response);
});

app.get("/api/service", checkAccessToken, async (req, res) => {
  const response = await serviceModel.getServices();
  res.json(response);
});

app.post("/api/service", checkAccessToken, runImageUpload(uploadService.single("file")), async (req, res) => {
  const serviceData = {
    ...req.body,
    s_service_url: req.file ? req.file.filename : (req.body.s_service_url || null),
  };
  const response = await serviceModel.addService(serviceData);

  if (response.isError && req.file) {
    // บันทึกไม่สำเร็จ → ลบไฟล์ที่ multer เพิ่งเขียน เพื่อไม่ให้เหลือไฟล์ขยะ
    fs.unlink(path.join("uploads", req.file.filename), () => {});
  }

  res.json(response);
});

app.put("/api/service", checkAccessToken, runImageUpload(uploadService.single("file")), async (req, res) => {
  let serviceUrl = undefined;
  if (req.file) {
    serviceUrl = req.file.filename;
  } else if (req.body.s_service_url !== undefined) {
    const rawUrl = req.body.s_service_url ? req.body.s_service_url.toString().trim() : "";
    serviceUrl = rawUrl === "" || rawUrl === "null" ? null : rawUrl;
  }

  const serviceData = {
    ...req.body,
    s_service_url: serviceUrl,
  };
  const response = await serviceModel.editService(serviceData);

  if (response.isError) {
    if (req.file) {
      // บันทึกไม่สำเร็จ → ลบไฟล์ที่ multer เพิ่งเขียน เพื่อไม่ให้เหลือไฟล์ขยะ
      fs.unlink(path.join("uploads", req.file.filename), () => {});
    }
  } else if (
    // โมเดลคืน old_service_url เฉพาะเมื่อเปลี่ยนรูปจริง จึงลบได้อย่างปลอดภัย
    response.data &&
    response.data.old_service_url &&
    response.data.old_service_url !== serviceUrl
  ) {
    // แทนที่/ลบรูปเดิม → ลบไฟล์เก่าทิ้ง
    fs.unlink(path.join("uploads", response.data.old_service_url), () => {});
  }

  res.json(response);
});

app.put("/api/service/status", checkAccessToken, async (req, res) => {
  const { service_id, s_service_active } = req.body;
  const response = await serviceModel.updateServiceStatus(
    service_id,
    s_service_active
  );
  res.json(response);
});

// รายการหมวดหมู่งานซ่อมตามส่วนของรถ
app.get("/api/repair_categories", checkAccessToken, async (req, res) => {
  const response = await vehicleRepairCategoryModel.getRepairCategories();
  res.json(response);
});

app.get("/api/sub_task_status", checkAccessToken, async (req, res) => {
  const response = await subTaskModel.getSubTaskStatuses();
  res.json(response);
});

app.post("/api/sub_task", checkAccessToken, async (req, res) => {
  const accountId = req.user.user_id;
  const response = await subTaskModel.addSubTask(req.body, accountId);
  res.json(response);
});

app.get("/api/sub_tasks", checkAccessToken, async (req, res) => {
  const orderId = req.query.order_id;
  const accountId = req.user.user_id;
  const response = await subTaskModel.getSubTasksByOrderId(orderId, accountId);
  res.json(response);
});

app.post("/api/sub_task/accept", checkAccessToken, async (req, res) => {
  const subTaskId = req.body.sub_task_id;
  const orderId = req.body.order_id;
  const accountId = req.user.user_id;
  const response = await subTaskModel.acceptSubTask(
    subTaskId,
    orderId,
    accountId,
  );
  res.json(response);
});

app.post("/api/sub_task/cancel", checkAccessToken, async (req, res) => {
  const subTaskId = req.body.sub_task_id;
  const orderId = req.body.order_id;
  const accountId = req.user.user_id;
  const response = await subTaskModel.cancelSubTask(
    subTaskId,
    orderId,
    accountId,
  );
  res.json(response);
});

app.post("/api/sub_task/update_status", checkAccessToken, async (req, res) => {
  const { sub_task_id, status_id } = req.body;
  const accountId = req.user.user_id;
  const response = await subTaskModel.updateSubTaskStatus(
    sub_task_id,
    status_id,
    accountId,
  );
  res.json(response);
});

app.get("/api/priority", checkAccessToken, async (req, res) => {
  const response = await priorityModel.getPriority();
  res.json(response);
});

app.get("/api/order_status", checkAccessToken, async (req, res) => {
  const response = await orderStatusModel.getOrderStatus();
  res.json(response);
});

app.get("/api/all_orders", checkAccessToken, async (req, res) => {
  const response = await order2Model.getAllOrders(req.query);
  res.json(response);
});

// order Endpoint (latest)
app.get("/api/order3", checkAccessToken, async (req, res) => {
  const accId = req.user.user_id;
  const response = await order3Model.getOrder(accId);
  res.json(response);
});

// สร้างใบสั่งซ่อมใหม่ (multipart: fields + รูป 1 รูป — ไฟล์เป็น optional)
app.post("/api/order3/create", checkAccessToken, runImageUpload(uploadOrder.single("file")), async (req, res) => {
  const imageName = req.file ? req.file.filename : null;
  const accountId = req.user.user_id;
  const response = await order3Model.createOrder(req.body, imageName, accountId);

  if (response.isError && req.file) {
    // บันทึกไม่สำเร็จ → ลบไฟล์ที่ multer เพิ่งเขียน เพื่อไม่ให้เหลือไฟล์ขยะ
    fs.unlink(path.join("uploads", req.file.filename), () => {});
  }

  res.json(response);
});

// ดึงใบสั่งซ่อมเดียว (ใช้เปิดหน้ารายละเอียดจากประวัติการซ่อมของรถ)
app.get("/api/order3/:orderId", checkAccessToken, async (req, res) => {
  const accId = req.user.user_id;
  const orderId = req.params.orderId ? Number(req.params.orderId) : null;
  const response = await order3Model.getOrderById(accId, orderId);
  res.json(response);
});

app.post("/api/order3/update_priority", checkAccessToken, async (req, res) => {
  const { order_id, priority_id } = req.body;
  const accountId = req.user.user_id;
  const response = await order3Model.updatePriorityOrder(order_id, priority_id, accountId);
  res.json(response);
});

app.post("/api/order3/update_status", checkAccessToken, async (req, res) => {
  const { order_id, status_id } = req.body;
  const accountId = req.user.user_id;
  const response = await order3Model.updateStatusOrder(order_id, status_id, accountId);
  res.json(response);
});

app.post("/api/order3/update_symptom", checkAccessToken, async (req, res) => {
  const { order_id, symptom } = req.body;
  const accountId = req.user.user_id;
  const response = await order3Model.updateSymptomOrder(order_id, symptom, accountId);
  res.json(response);
});

app.get("/api/order3/images/:orderId", checkAccessToken, async (req, res) => {
  const { orderId } = req.params;
  const response = await order3Model.getImages(orderId);
  res.json(response);
});

app.post("/api/order3/upload_image", checkAccessToken, runImageUpload(uploadOrder.single("file")), async (req, res) => {
  if (!req.file) {
    return res.json({ isError: true, data: null, errorMessage: "กรุณาแนบไฟล์รูปภาพ" });
  }
  const orderId = req.body.order_id;
  const imageUrl = req.file.filename;
  const accountId = req.user.user_id;
  const response = await order3Model.addImage(orderId, imageUrl, accountId);

  if (response.isError) {
    // บันทึกไม่สำเร็จ → ลบไฟล์ที่ multer เพิ่งเขียน เพื่อไม่ให้เหลือไฟล์ขยะ
    fs.unlink(path.join("uploads", req.file.filename), () => {});
  }

  res.json(response);
});

app.delete("/api/order3/image/:imageId", checkAccessToken, async (req, res) => {
  const { imageId } = req.params;
  const accountId = req.user.user_id;
  const response = await order3Model.deleteImage(imageId, accountId);

  // ลบไฟล์บนดิสก์ตามชื่อไฟล์ที่ได้คืนกลับมา
  if (!response.isError && response.data && response.data.image_url) {
    fs.unlink(path.join("uploads", response.data.image_url), () => {});
  }

  res.json(response);
});

app.get("/api/order3/order_technicians/:orderId", checkAccessToken, async (req, res) => {
  const { orderId } = req.params;
  const response = await order3Model.getOrderTechnician(orderId);
  res.json(response);
});

app.post("/api/order3/accept_order", checkAccessToken, async (req, res) => {
  const { order_id } = req.body;
  const accountId = req.user.user_id;
  const response = await order3Model.acceptOrder(order_id, accountId);
  res.json(response);
});

app.post("/api/order3/cancel_order", checkAccessToken, async (req, res) => {
  const { order_id } = req.body;
  const accountId = req.user.user_id;
  const response = await order3Model.cancelAcceptOrder(order_id, accountId);
  res.json(response);
});

app.get("/api/order_by_id", checkAccessToken, async (req, res) => {
  const orderId = req.query.order_id;
  const userId = req.query.user_id;
  const response = await order2Model.getOrderById(orderId, userId);
  res.json(response);
});

app.get("/api/order/technicians", checkAccessToken, async (req, res) => {
  const orderId = req.query.order_id;
  const response = await order2Model.getOrderTechnicians(orderId);
  res.json(response);
});

app.post("/api/order/accept", checkAccessToken, async (req, res) => {
  const orderId = req.body.order_id;
  const accountId = req.user.user_id;
  const response = await order2Model.acceptOrder(orderId, accountId);
  res.json(response);
});

app.post("/api/order/cancel_technician", checkAccessToken, async (req, res) => {
  const orderId = req.body.order_id;
  const accountId = req.user.user_id;
  const response = await order2Model.cancelOrderTechnician(orderId, accountId);
  res.json(response);
});

app.post("/api/order/update_status", checkAccessToken, async (req, res) => {
  const orderId = req.body.order_id;
  const statusId = req.body.status_id;
  const accountId = req.user.user_id;
  const response = await order2Model.updateOrderStatus(
    orderId,
    statusId,
    accountId,
  );
  res.json(response);
});

app.get("/api/user_role", checkAccessToken, async (req, res) => {
  const response = await userRoleModel.getUserRole();
  res.json(response);
});

app.post("/api/employee", checkAccessToken, async (req, res) => {
  const createByAccountId = req.user.user_id;
  const response = await empModel.addEmployee(req.body, createByAccountId);
  res.json(response);
});

app.put("/api/employee", checkAccessToken, async (req, res) => {
  const response = await empModel.updateEmployee(req.body);
  res.json(response);
});

app.put("/api/employee/status", checkAccessToken, async (req, res) => {
  const { emp_id, acc_is_active } = req.body;
  const response = await empModel.updateEmployeeStatus(emp_id, acc_is_active);
  res.json(response);
});

app.delete("/api/employee", checkAccessToken, async (req, res) => {
  const empId = req.body.emp_id;
  const response = await empModel.deleteEmployee(empId);
  res.json(response);
});

app.put("/api/employee/restore", checkAccessToken, async (req, res) => {
  const empId = req.body.emp_id;
  const response = await empModel.restoreEmployee(empId);
  res.json(response);
});

app.get("/api/getPart", checkAccessToken, async (req, res) => {
  const response = await partModel.getPart();
  res.json(response);
});

app.post("/api/postPart", checkAccessToken, runImageUpload(uploadPart.single("file")), async (req, res) => {
  const partData = {
    ...req.body,
    // ถ้ามีไฟล์อัปโหลดจริง ให้ใช้ชื่อไฟล์ที่ multer บันทึก (req.file.filename)
    // ถ้าไม่มี ให้ใช้ค่าที่ส่งมาใน body หรือ null
    part_url: req.file ? req.file.filename : (req.body.part_url || null),
  };
  const response = await partModel.addPart(partData);

  if (response.isError && req.file) {
    // บันทึกไม่สำเร็จ → ลบไฟล์ที่ multer เพิ่งเขียน เพื่อไม่ให้เหลือไฟล์ขยะ
    fs.unlink(path.join("uploads", req.file.filename), () => {});
  }

  res.json(response);
});

app.put("/api/putPart", checkAccessToken, runImageUpload(uploadPart.single("file")), async (req, res) => {
  let partUrl = undefined;
  if (req.file) {
    partUrl = req.file.filename;
  } else if (req.body.part_url !== undefined) {
    const rawUrl = req.body.part_url ? req.body.part_url.toString().trim() : "";
    partUrl = rawUrl === "" || rawUrl === "null" ? null : rawUrl;
  }

  const partData = {
    ...req.body,
    part_url: partUrl,
  };
  const response = await partModel.editPart(partData);

  if (response.isError) {
    if (req.file) {
      // บันทึกไม่สำเร็จ → ลบไฟล์ที่ multer เพิ่งเขียน เพื่อไม่ให้เหลือไฟล์ขยะ
      fs.unlink(path.join("uploads", req.file.filename), () => {});
    }
  } else if (
    // โมเดลคืน old_part_url เฉพาะเมื่อเปลี่ยนรูปจริง จึงลบได้อย่างปลอดภัย
    response.data &&
    response.data.old_part_url &&
    response.data.old_part_url !== partUrl
  ) {
    // แทนที่/ลบรูปเดิม → ลบไฟล์เก่าทิ้ง
    fs.unlink(path.join("uploads", response.data.old_part_url), () => {});
  }

  res.json(response);
});

app.delete("/api/deletePart", checkAccessToken, async (req, res) => {
  const partId = req.body?.part_id || req.query?.part_id;
  if (!partId) {
    return res.json({
      isError: true,
      data: "",
      errorMessage: "กรุณาระบุ part_id",
    });
  }
  const response = await partModel.deletePart(partId);
  res.json(response);
});

app.put("/api/part/status", checkAccessToken, async (req, res) => {
  const { part_id, part_is_active } = req.body;
  const response = await partModel.updatePartStatus(part_id, part_is_active);
  res.json(response);
});

app.get("/api/category", checkAccessToken, async (req, res) => {
  const response = await partModel.getPartCategories();
  res.json(response);
});
app.get("/api/brand", checkAccessToken, async (req, res) => {
  const response = await partModel.getPartBrands();
  res.json(response);
});


// Vehicle Brand routes (ข้อมูลหลัก: ยี่ห้อรถ)
app.get("/api/vehicle_brand", checkAccessToken, async (req, res) => {
  const response = await vehicleModel.getBrands();
  res.json(response);
});
app.post("/api/vehicle_brand", checkAccessToken, async (req, res) => {
  const response = await vehicleModel.addBrand(req.body);
  res.json(response);
});
app.put("/api/vehicle_brand", checkAccessToken, async (req, res) => {
  const response = await vehicleModel.updateBrand(req.body);
  res.json(response);
});
app.delete("/api/vehicle_brand", checkAccessToken, async (req, res) => {
  const brandId = req.body.vb_id;
  const response = await vehicleModel.deleteBrand(brandId);
  res.json(response);
});

// Vehicle Model routes (ข้อมูลหลัก: รุ่นรถ)
app.get("/api/vehicle_model", checkAccessToken, async (req, res) => {
  const response = await vehicleModel.getModels();
  res.json(response);
});
app.post("/api/vehicle_model", checkAccessToken, async (req, res) => {
  const response = await vehicleModel.addModel(req.body);
  res.json(response);
});
app.put("/api/vehicle_model", checkAccessToken, async (req, res) => {
  const response = await vehicleModel.updateModel(req.body);
  res.json(response);
});
app.delete("/api/vehicle_model", checkAccessToken, async (req, res) => {
  const modelId = req.body.vm_id;
  const response = await vehicleModel.deleteModel(modelId);
  res.json(response);
});

app.post("/api/vehicle_search_license_plate", checkAccessToken, async (req, res) => {
  const licenseplate = req.body.v_license_plate;
  const response = await vehicleSearchModel.searchLicensePlate(licenseplate);
  res.json(response);
});

app.post("/api/vehicle_search_phone", checkAccessToken, async (req, res) => {
  const phone = req.body.phone;
  const response = await vehicleSearchModel.searchPhone(phone);
  res.json(response);
});

app.post("/api/add_customer", checkAccessToken, async (req, res) => {
  const response = await addnewcustomer.addCustomer(req.body);
  res.json(response);
});

app.post("/api/add_vehicle_by_cus", checkAccessToken, async (req, res) => {
  const response = await addnewcustomer.add_vehicle_by_cus(req.body);
  res.json(response);
});

app.post("/api/vehicle_orders", checkAccessToken, async (req, res) => {
  const vehicleId = req.body.vehicle_id;
  const response = await order2Model.getOrdersByVehicleId(vehicleId);
  res.json(response);
});

// Part Requisition Endpoints
app.get("/api/compatible_parts", checkAccessToken, async (req, res) => {
  const subTaskId = req.query.sub_task_id;
  const response = await partRequisitionModel.getCompatibleParts(subTaskId);
  res.json(response);
});

app.get("/api/request_parts", checkAccessToken, async (req, res) => {
  const subTaskId = req.query.sub_task_id;
  const response =
    await partRequisitionModel.getRequestPartsBySubTaskId(subTaskId);
  res.json(response);
});

app.get("/api/req_part_status", checkAccessToken, async (req, res) => {
  const response = await partRequisitionModel.getReqPartStatuses();
  res.json(response);
});

app.post("/api/request_part", checkAccessToken, async (req, res) => {
  const accountId = req.user.user_id;
  const response = await partRequisitionModel.createRequestPart(
    req.body,
    accountId,
  );
  res.json(response);
});

app.get("/api/approval_request_parts", checkAccessToken, async (req, res) => {
  const statusId = req.query.status_id;
  const response = await partRequisitionModel.getRequestPartsForApproval(
    statusId,
  );
  res.json(response);
});

app.post("/api/request_part/update_status", checkAccessToken, async (req, res) => {
    const { request_part_id, status_id } = req.body;
    const accountId = req.user.user_id;
    const response = await partRequisitionModel.updateRequestPartStatus(
      request_part_id,
      status_id,
      accountId,
    );
    res.json(response);
  },
);

app.get("/api/payment_methods", checkAccessToken, async (req, res) => {
  const response = await paymentMethodModel.getPaymentMethod();
  res.json(response);
});

app.get("/api/payment_statuses", checkAccessToken, async (req, res) => {
  const response = await paymentStatusModel.getPaymentStatus();
  res.json(response);
});

// ----- บิลแบบ live (invoice2) -----
app.get("/api/invoice2/:orderId", checkAccessToken, async (req, res) => {
  const response = await invoice2Model.getInvoiceByOrderId(req.params.orderId);
  res.json(response);
});

app.post("/api/invoice2/create", checkAccessToken, async (req, res) => {
  const orderId = req.body.order_id;
  const accountId = req.user.user_id;
  const response = await invoice2Model.createInvoice(orderId, accountId);
  res.json(response);
});

app.post(
  "/api/invoice2/upload_image",
  checkAccessToken,
  runImageUpload(uploadInvoice.single("file")),
  async (req, res) => {
    if (!req.file) {
      return res.json({
        isError: true,
        data: null,
        errorMessage: "กรุณาแนบไฟล์รูปภาพ",
      });
    }
    const invoiceId = req.body.invoice_id;
    const imageUrl = req.file.filename;
    const response = await invoice2Model.setImage(
      invoiceId,
      imageUrl,
      req.user.user_id
    );
    if (response.isError) {
      // บันทึกไม่สำเร็จ → ลบไฟล์ที่ multer เพิ่งเขียน เพื่อไม่ให้เหลือไฟล์ขยะ
      fs.unlink(path.join("uploads", req.file.filename), () => {});
    } else if (response.data && response.data.old_image_url) {
      // แทนที่รูปเดิม → ลบไฟล์เก่าทิ้ง
      fs.unlink(path.join("uploads", response.data.old_image_url), () => {});
    }
    res.json(response);
  }
);

app.post("/api/invoice2/delete_image", checkAccessToken, async (req, res) => {
  const response = await invoice2Model.clearImage(
    req.body.invoice_id,
    req.user.user_id
  );
  // ลบไฟล์บนดิสก์ตามชื่อไฟล์ที่ได้คืนกลับมา
  if (!response.isError && response.data && response.data.image_url) {
    fs.unlink(path.join("uploads", response.data.image_url), () => {});
  }
  res.json(response);
});

app.post("/api/invoice2/payment_method", checkAccessToken, async (req, res) => {
  const { invoice_id, payment_method_id } = req.body;
  const response = await invoice2Model.updatePaymentMethod(
    invoice_id,
    payment_method_id,
    req.user.user_id
  );
  res.json(response);
});

app.post("/api/invoice2/payment_status", checkAccessToken, async (req, res) => {
  const { invoice_id, payment_status_id } = req.body;
  const response = await invoice2Model.updatePaymentStatus(
    invoice_id,
    payment_status_id,
    req.user.user_id
  );
  res.json(response);
});

app.post("/api/invoice2/cancel", checkAccessToken, async (req, res) => {
  const response = await invoice2Model.cancelInvoice(
    req.body.invoice_id,
    req.user.user_id
  );
  res.json(response);
});

// salary history
app.get("/api/salary_history", checkAccessToken, async (req, res) => {
  const response = await salaryHistoryModel.getSalaryHistory();
  res.json(response);
});

app.put("/api/salary_history", checkAccessToken, async (req, res) => {
  const response = await salaryHistoryModel.putUpdateSalary(req.body);
  res.json(response);
});

const hostname = "127.0.0.1";
const port = 3000;

const server = http.createServer((req, res) => {
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/planin");
  res.end("Hello Uncle");
});

app.listen(port, hostname, () => {
  console.log(`Server running at http://${hostname}:${port}/`);
});
