module.exports = {
    getCurrentDateForToken: () => {
        const now = new Date();
        const formattedDate = new Intl.DateTimeFormat('en-GB', { // จัดรูปแบบเวลา วันที่สไตล์อังกฤษ วัน/เดือน/ปี
            day: '2-digit', // ตัวเลขแบบ 2 หลัก
            month: '2-digit',
            year: 'numeric', 
        }).format(now).replace(/\//g, '-'); // ค้นหาและแทนที่คำ \/ ตรงกลาง หมายถึง เลือกที่ / || g = เปลี่ยนทุกตัวที่เจอในประโยค

        return formattedDate;
    }
}