var jwt = require('jsonwebtoken');
var secretKey = "MySecretKey";

module.exports = {
    sign(payload) { // Payload คือข้อมูลที่ผู้ใช้ส่งมา เช่น {"userId": 5, "username": "owner01"}
        let token = jwt.sign(payload, secretKey, { // jwt.sign create token จะเอาข้อมูลผู้ใช้และรหัสลับมาผสมกัน
            expiresIn: '1d' // token มีระยะเวลา 1 วัน
        });
        console.log('jwt token: ' + token);
        return token;
    },

    // eyJhbGciOiJIUzI1Ni.eyJ1c2VySWQiOjUsIm.SflKxwRJSMeKKF2QT4f
    // ส่วนที่ 1 (ท่อนแรกก่อนจุด): คือ Header (ข้อมูลที่บอกว่าตั๋วนี้ใช้วิธีเข้ารหัสแบบไหน)
    // ส่วนที่ 2 (ท่อนกลาง): คือ Payload (ข้อมูลของคุณที่ซ่อนไว้ เช่น playlord ที่ใส่เข้ามาตอนสร้างตั๋ว และเวลาหมดอายุ)
    // ส่วนที่ 3 (ท่อนสุดท้าย): คือ Signature (ลายเซ็นลับที่ระบบคำนวณออกมา)

    verify(token) {
        return new Promise((resolve, reject) => {
            jwt.verify(token, secretKey, (err, decode) => {
                if (err) {
                    reject(err)
                } else {
                    resolve(decode)
                }
            });
        });
    }
}