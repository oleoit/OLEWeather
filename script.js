const apiKey = "541b300d35f3acf5ca1b22f82ca0f261";
let myChart = null;
let map = null;
let fullForecastData = []; 
let currentChartType = 'temp';
let selectedDayIndex = 0;

Chart.register(ChartDataLabels);

// --- 1. ฟังก์ชันค้นหาพิกัดจากชื่อภาษาไทย (Geocoding) ---
async function searchLocation(query) {
    document.getElementById("loader").style.display = "block";
    document.getElementById("main-content").style.display = "none";

    // ใช้ Nominatim API เพื่อหาพิกัดจากชื่อภาษาไทย
    const geoUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`;

    try {
        const response = await fetch(geoUrl);
        const data = await response.json();

        if (data && data.length > 0) {
            const lat = data[0].lat;
            const lon = data[0].lon;
            
            // เมื่อได้พิกัดแล้ว ให้ไปดึงข้อมูลสภาพอากาศ
            await fetchWeather(query, lat, lon);
        } else {
            alert("ไม่พบสถานที่: " + query);
            document.getElementById("loader").style.display = "none";
        }
    } catch (error) {
        console.error("Geocoding error:", error);
        alert("เกิดข้อผิดพลาดในการค้นหาพิกัด");
        document.getElementById("loader").style.display = "none";
    }
}

// --- 2. ฟังก์ชันดึงข้อมูลสภาพอากาศ ---
async function fetchWeather(displayName, lat, lon) {
    let urlNow = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&appid=${apiKey}&lang=th`;
    let urlFore = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&units=metric&appid=${apiKey}&lang=th`;

    try {
        const [resNow, resFore] = await Promise.all([fetch(urlNow), fetch(urlFore)]);
        const dataNow = await resNow.json();
        const dataFore = await resFore.json();

        if (dataNow.cod !== 200) throw new Error(dataNow.message);

        fullForecastData = dataFore.list;
        selectedDayIndex = 0; 
        
        // อัปเดต UI
        updateUI(dataNow, dataFore, displayName);
        
        // แสดงกราฟวันแรก
        showDayDetail(0); 

        document.getElementById("loader").style.display = "none";
        document.getElementById("main-content").style.display = "block";

        // แก้ไขปัญหาวาดแผนที่แหว่ง
        setTimeout(() => { if (map) map.invalidateSize(); }, 400);
    } catch (error) {
        alert("ไม่พบข้อมูลสภาพอากาศ: " + error.message);
        document.getElementById("loader").style.display = "none";
    }
}

// --- 3. อัปเดตข้อมูลบนหน้าจอ ---
function updateUI(now, fore, displayName) {
    // ใช้ชื่อภาษาไทยที่ค้นหา ถ้าไม่มีให้ใช้ชื่อจาก API
    document.getElementById("city-name").innerText = displayName || now.name;
    document.getElementById("current-temp").innerText = Math.round(now.main.temp);
    document.getElementById("description").innerText = now.weather[0].description;
    document.getElementById("humidity").innerText = now.main.humidity;
    document.getElementById("wind-speed").innerText = now.wind.speed;
    
    // ไอคอนหลัก (ใช้ Class .red-sun เพื่อย้อมสีใน CSS)
    document.getElementById("main-icon").src = `https://openweathermap.org/img/wn/${now.weather[0].icon}@4x.png`;
    
    // โอกาสฝนตกของช่วงเวลาปัจจุบัน
    document.getElementById("rain-chance").innerText = Math.round(fore.list[0].pop * 100);

    const d = new Date();
    document.getElementById("date-text").innerText = d.toLocaleDateString('th-TH', { weekday: 'long', hour: '2-digit', minute:'2-digit' });

    // จัดการพยากรณ์รายวัน (5 วัน)
    const container = document.getElementById("forecast-container");
    container.innerHTML = "";
    
    const dailyGroup = {};
    fore.list.forEach(item => {
        const date = item.dt_txt.split(" ")[0];
        if (!dailyGroup[date]) dailyGroup[date] = [];
        dailyGroup[date].push(item);
    });

    Object.keys(dailyGroup).slice(0, 5).forEach((date, index) => {
        const dayData = dailyGroup[date];
        const temps = dayData.map(d => d.main.temp);
        const maxTemp = Math.round(Math.max(...temps));
        const minTemp = Math.round(Math.min(...temps));
        const icon = dayData[Math.floor(dayData.length/2)].weather[0].icon;
        const dayName = new Date(date).toLocaleDateString('th-TH', { weekday: 'short' });

        const itemDiv = document.createElement("div");
        itemDiv.className = `forecast-item ${index === selectedDayIndex ? 'selected' : ''}`;
        itemDiv.innerHTML = `
            <p>${dayName}</p>
            <img class="weather-icon red-sun" src="https://openweathermap.org/img/wn/${icon}.png">
            <p>
                <span class="temp-max">${maxTemp}°</span>
                <span class="temp-slash">/</span>
                <span class="temp-min">${minTemp}°</span>
            </p>
        `;
        itemDiv.onclick = () => {
            selectedDayIndex = index;
            document.querySelectorAll('.forecast-item').forEach(i => i.classList.remove('selected'));
            itemDiv.classList.add('selected');
            showDayDetail(index);
        };
        container.appendChild(itemDiv);
    });

    updateMap(now.coord.lat, now.coord.lon);
}

// --- 4. กราฟและการสลับแท็บ ---
function showDayDetail(dayIdx) {
    const startIndex = dayIdx * 8; 
    const daySubset = fullForecastData.slice(startIndex, startIndex + 8);
    updateChart(currentChartType, daySubset);
}

function changeTab(event, type) {
    document.querySelectorAll('.tab-link').forEach(t => t.classList.remove('active'));
    event.target.classList.add('active');
    currentChartType = type;
    showDayDetail(selectedDayIndex);
}

function updateChart(type, dataList) {
    const ctx = document.getElementById('weatherChart').getContext('2d');
    const labels = dataList.map(item => item.dt_txt.substring(11, 16));
    let dataValues = [], unit = "", color = "#fbbc04";

    if (type === 'temp') {
        dataValues = dataList.map(item => Math.round(item.main.temp));
        unit = "°"; color = "#fbbc04";
    } else if (type === 'rain') {
        dataValues = dataList.map(item => Math.round(item.pop * 100));
        unit = "%"; color = "#4285f4";
    } else {
        dataValues = dataList.map(item => item.wind.speed);
        unit = " กม./ชม."; color = "#34a853";
    }

    if (myChart) myChart.destroy();
    myChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                data: dataValues, borderColor: color, backgroundColor: color + "15",
                fill: true, tension: 0.4, pointRadius: 5, pointBackgroundColor: color,
                datalabels: { align: 'top', anchor: 'end', offset: 4 }
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            layout: { padding: { top: 30 } },
            plugins: {
                legend: { display: false },
                datalabels: {
                    color: '#5f6368', font: { weight: 'bold' },
                    formatter: (v) => v + unit
                }
            },
            scales: { 
                y: { display: false, beginAtZero: type === 'rain' }, 
                x: { grid: { display: false } } 
            }
        }
    });
}

// --- 5. แผนที่และ GPS ---
function updateMap(lat, lon) {
    if (map) { 
        map.setView([lat, lon], 12); 
    } else {
        map = L.map('map').setView([lat, lon], 12);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
    }
    map.eachLayer(l => { if (l instanceof L.Marker) map.removeLayer(l); });
    L.marker([lat, lon]).addTo(map);
}

// --- 6. Event Listeners ---
document.getElementById("search-btn").onclick = () => {
    const query = document.getElementById("search-input").value;
    if (query) searchLocation(query);
};

document.getElementById("search-input").onkeypress = (e) => {
    if (e.key === "Enter") {
        searchLocation(e.target.value);
    }
};

document.getElementById("gps-btn").onclick = () => {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(pos => {
            fetchWeather("ตำแหน่งปัจจุบัน", pos.coords.latitude, pos.coords.longitude);
        }, () => alert("กรุณาเปิดการเข้าถึงตำแหน่ง"));
    }
};

// เริ่มต้นโปรแกรม
searchLocation("Bangkok");