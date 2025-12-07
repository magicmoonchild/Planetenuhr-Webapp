// --- KONSTANTEN ---
const FENSTER_GROESSE = 600;
const ZENTRUM = FENSTER_GROESSE / 2;
const UMRANDE_GROESSE = 40;

let zoom_level = -10;
let offset_x = 0;
let offset_y = 0;
let currentDate = new Date();
let isDragging = false;
let lastMouseX = 0;
let lastMouseY = 0;
let playbackInterval = null;
let currentPlaybackMode = null;
let selectedPlanet = null;
let autoCentering = false;
let clickStartTime = 0;
let clickStartX = 0;
let clickStartY = 0;
let currentPlanetData = null;

// Geschwindigkeiten für die Play-Buttons
const PLAYBACK_SPEEDS = {
    'realtime': 1000,    // Echtzeit
    'day': 500,          // x2: 2 Tage pro Sekunde
    'month': 333,        // x3: 3 Monate pro Sekunde
    'year': 250          // x4: 4 Jahre pro Sekunde
};

function formatDate(date) {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    return `${year}/${month}/${day} ${hours}:${minutes}:${seconds}`;
}

// Debouncing für Updates
let updateTimeout = null;
const UPDATE_DELAY = 100; // ms

function scheduleUpdate() {
    if (updateTimeout) {
        clearTimeout(updateTimeout);
    }
    updateTimeout = setTimeout(() => {
        updatePlanetData();
    }, UPDATE_DELAY);
}

// NEUE FUNKTION: Parse Datum aus String
function parseDateFromString(dateString) {
    // Erwartetes Format: "YYYY/MM/DD HH:MM:SS"
    const parts = dateString.split(' ');
    const datePart = parts[0].split('/');
    const timePart = parts[1].split(':');

    const year = parseInt(datePart[0]);
    const month = parseInt(datePart[1]) - 1; // Monate sind 0-basiert
    const day = parseInt(datePart[2]);
    const hours = parseInt(timePart[0]);
    const minutes = parseInt(timePart[1]);
    const seconds = parseInt(timePart[2]);

    return new Date(year, month, day, hours, minutes, seconds);
}

// Optimierte Update-Funktion
async function updatePlanetData() {
    // Clear pending update
    if (updateTimeout) {
        clearTimeout(updateTimeout);
        updateTimeout = null;
    }

    const datumInput = document.getElementById('datumInput').value;

    try {
        const response = await fetch('/api/planet_data', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                datum: datumInput,
                zoom_level: zoom_level,
                offset_x: offset_x,
                offset_y: offset_y,
                selected_planet: selectedPlanet
            })
        });

        // Check if response is ok before parsing
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        if (data.error) {
            document.getElementById('status').textContent = 'Fehler: ' + data.error;
            return;
        }

        // Speichere die aktuellen Daten für die Auswahl
        currentPlanetData = data;

        drawPlanetenuhr(data);

        // VERBESSERTE FEHLERBEHANDLUNG FÜR STATUS
        if (data.status) {
            updateStatus(data.status);
            updatePlanetInfo(data.selected_planet_info, data.status.selected_planet, data);
        } else {
            // Fallback für fehlenden Status
            updateStatus({
                zoom_level: zoom_level,
                modus_anzeige: "UNBEKANNT",
                datum_uhrzeit_str: datumInput,
                sonnen_radius_info: "N/A",
                selected_planet: selectedPlanet
            });
            updatePlanetInfo(data.selected_planet_info, selectedPlanet, data);
        }

    } catch (error) {
        console.error('Update error:', error);
        document.getElementById('status').textContent = 'Fehler beim Laden der Daten: ' + error.message;

        // Fallback-Status anzeigen
        updateStatus({
            zoom_level: zoom_level,
            modus_anzeige: "FEHLER",
            datum_uhrzeit_str: datumInput,
            sonnen_radius_info: "N/A",
            selected_planet: selectedPlanet
        });
    }
}

// Optimierte Zoom-Funktionen mit Ebenen-Unterstützung
function changeZoom(amount) {
    const new_level = zoom_level + amount;

    if (new_level >= -30 && new_level <= 20) {
        zoom_level = new_level;
        scheduleUpdate(); // Auswahl bleibt immer erhalten
    }
}


// Verbesserte Zentrierung für + Button
function handlePlusZoom() {
    if (selectedPlanet) {
        // Setze Zoom auf Level 3 für gute Übersicht und zentriere
        changeZoom(1);
        centerExactlyOnSelectedPlanet();
    } else {
        // Einfach um 1 Level zoomen
        changeZoom(1);
    }
}

// Touch Support für Planetenselektion
function setupTouchSelection() {
    const canvas = document.getElementById('planetCanvas');
    let touchStartTime = 0;
    let touchStartX = 0;
    let touchStartY = 0;
    let isTouchMoving = false;

    canvas.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const touch = e.touches[0];
        touchStartTime = Date.now();
        touchStartX = touch.clientX;
        touchStartY = touch.clientY;
        isTouchMoving = false;
    });

    canvas.addEventListener('touchmove', (e) => {
        if (e.touches.length === 1) {
            const touch = e.touches[0];
            const deltaX = Math.abs(touch.clientX - touchStartX);
            const deltaY = Math.abs(touch.clientY - touchStartY);

            // Wenn Bewegung größer als 10px, handelt es sich um Drag
            if (deltaX > 10 || deltaY > 10) {
                isTouchMoving = true;
            }
        }
    });

    canvas.addEventListener('touchend', (e) => {
        e.preventDefault();
        const touchTime = Date.now() - touchStartTime;

        // Nur als Tap behandeln wenn:
        // - Kurze Berührungszeit (< 300ms)
        // - Keine signifikante Bewegung
        // - Nur ein Finger verwendet wurde
        if (touchTime < 300 && !isTouchMoving && e.touches.length === 0) {
            const rect = canvas.getBoundingClientRect();
            const touch = e.changedTouches[0];
            const x = touch.clientX - rect.left;
            const y = touch.clientY - rect.top;

            selectPlanetByExactOrbit(x, y);
        }

        isTouchMoving = false;
    });
}

// Verbesserte Planeten-Auswahl mit Ebenen-Unterstützung und Touch-Optimierung
function selectPlanetByExactOrbit(x, y) {
    if (!currentPlanetData) return;

    const currentRange = getCurrentLevelRange(zoom_level);
    let selected = false;

    if (currentRange === 'sonnensystem') {
        // Sonnensystem Auswahl-Logik
        const centerX = currentPlanetData.sonne.x;
        const centerY = currentPlanetData.sonne.y;

        // Prüfe Sonne zuerst
        const distToSun = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2);
        if (distToSun < currentPlanetData.sonne.radius + 15) { // Größerer Klickbereich für Touch
            selectedPlanet = 'Sonne';
            selected = true;
        }

        // Prüfe Planeten
        if (!selected) {
            let minDistance = Infinity;
            let closestPlanet = null;

            currentPlanetData.planeten.forEach(planet => {
                const distance = Math.sqrt((x - planet.x) ** 2 + (y - planet.y) ** 2);
                // Größerer Klickbereich für Touch (point_radius + 8 statt +5)
                if (distance < planet.point_radius + 8 && distance < minDistance) {
                    minDistance = distance;
                    closestPlanet = planet.name;
                }
            });

            if (closestPlanet) {
                selectedPlanet = closestPlanet;
                selected = true;
            }
        }

        // Prüfe Umlaufbahnen als Fallback
        if (!selected) {
            const distToCenter = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2);
            let minDistance = Infinity;
            let closestPlanet = null;

            currentPlanetData.umlaufbahnen.forEach((bahn, index) => {
                const planets = ['Sonne', 'Merkur', 'Venus', 'Erde', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptun', 'Pluto'];
                if (index < planets.length - 1) {
                    const distance = Math.abs(distToCenter - bahn.radius);
                    // Größerer Toleranzbereich für Touch
                    if (distance < 8 && distance < minDistance) {
                        minDistance = distance;
                        closestPlanet = planets[index + 1];
                    }
                }
            });

            if (closestPlanet) {
                selectedPlanet = closestPlanet;
                selected = true;
            }
        }

    } else if (currentRange === 'milchstrasse') {
        // Milchstraßen Auswahl-Logik mit größeren Klickbereichen
        selectStarByProximity(x, y, 12); // Vergrößerter Klickbereich

    } else {
        // Galaxien Auswahl-Logik mit größeren Klickbereichen
        selectGalaxyByProximity(x, y, 15); // Vergrößerter Klickbereich
    }

    // Visuelles Feedback für Touch-Auswahl
    if (selectedPlanet) {
        showTouchFeedback(x, y, selectedPlanet);
    }

    updatePlanetData();
}

function getCurrentLevelRange(zoom_level) {
    if (zoom_level >= -10) return 'sonnensystem';
    else if (zoom_level >= -20) return 'milchstrasse';
    else return 'galaxien';
}

// Verbesserte Auswahlfunktionen mit anpassbaren Klickbereichen
function selectStarByProximity(x, y, clickRadius = 12) {
    if (!currentPlanetData.sterne) return;

    let minDistance = Infinity;
    let closestStar = null;

    // Prüfe Sonne mit größerem Klickbereich
    const distToSun = Math.sqrt((x - currentPlanetData.sonne.x) ** 2 + (y - currentPlanetData.sonne.y) ** 2);
    if (distToSun < currentPlanetData.sonne.radius + clickRadius) {
        selectedPlanet = 'Sonne';
        return;
    }

    // Prüfe andere Sterne
    currentPlanetData.sterne.forEach(star => {
        const distance = Math.sqrt((x - star.x) ** 2 + (y - star.y) ** 2);
        if (distance < star.radius + clickRadius && distance < minDistance) {
            minDistance = distance;
            closestStar = star.name;
        }
    });

    if (closestStar) {
        selectedPlanet = closestStar;
    }
}

function selectGalaxyByProximity(x, y, clickRadius = 15) {
    if (!currentPlanetData.galaxien) return;

    let minDistance = Infinity;
    let closestGalaxy = null;

    // Prüfe Milchstraße mit größerem Klickbereich
    const distToMilkyway = Math.sqrt((x - currentPlanetData.milchstrasse.x) ** 2 + (y - currentPlanetData.milchstrasse.y) ** 2);
    if (distToMilkyway < currentPlanetData.milchstrasse.radius + clickRadius) {
        selectedPlanet = 'Milchstraße';
        return;
    }

    // Prüfe andere Galaxien
    currentPlanetData.galaxien.forEach(galaxy => {
        const distance = Math.sqrt((x - galaxy.x) ** 2 + (y - galaxy.y) ** 2);
        if (distance < galaxy.radius + clickRadius && distance < minDistance) {
            minDistance = distance;
            closestGalaxy = galaxy.name;
        }
    });

    if (closestGalaxy) {
        selectedPlanet = closestGalaxy;
    }
}

// Visuelles Feedback für Touch-Auswahl
function showTouchFeedback(x, y, planetName) {
    const canvas = document.getElementById('planetCanvas');
    const ctx = canvas.getContext('2d');

    // Zeichne einen pulsierenden Kreis um den ausgewählten Punkt
    let radius = 20;
    let opacity = 0.8;

    function animateFeedback() {
        // Lösche nur den betroffenen Bereich
        ctx.clearRect(x - radius - 5, y - radius - 5, radius * 2 + 10, radius * 2 + 10);

        ctx.beginPath();
        ctx.arc(x, y, radius, 0, 2 * Math.PI);
        ctx.strokeStyle = `rgba(255, 255, 255, ${opacity})`;
        ctx.lineWidth = 3;
        ctx.stroke();

        radius += 1;
        opacity -= 0.05;

        if (opacity > 0) {
            requestAnimationFrame(animateFeedback);
        } else {
            // Nach Animation neu zeichnen
            if (currentPlanetData) {
                drawPlanetenuhr(currentPlanetData);
            }
        }
    }

    animateFeedback();
}

// Korrigierte Zentrierungs-Funktionen
function centerExactlyOnSelectedPlanet() {
    if (selectedPlanet && currentPlanetData) {
        let targetX, targetY;

        if (currentPlanetData.ebene === 'sonnensystem') {
            if (selectedPlanet === 'Sonne') {
                targetX = currentPlanetData.sonne.x;
                targetY = currentPlanetData.sonne.y;
            } else {
                const planet = currentPlanetData.planeten.find(p => p.name === selectedPlanet);
                if (planet) {
                    targetX = planet.x;
                    targetY = planet.y;
                }
            }
        } else if (currentPlanetData.ebene === 'milchstrasse') {
            if (selectedPlanet === 'Sonne') {
                targetX = currentPlanetData.sonne.x;
                targetY = currentPlanetData.sonne.y;
            } else {
                const star = currentPlanetData.sterne.find(s => s.name === selectedPlanet);
                if (star) {
                    targetX = star.x;
                    targetY = star.y;
                }
            }
        } else if (currentPlanetData.ebene === 'galaxien') {
            if (selectedPlanet === 'Milchstraße') {
                targetX = currentPlanetData.milchstrasse.x;
                targetY = currentPlanetData.milchstrasse.y;
            } else {
                const galaxy = currentPlanetData.galaxien.find(g => g.name === selectedPlanet);
                if (galaxy) {
                    targetX = galaxy.x;
                    targetY = galaxy.y;
                }
            }
        }

        if (targetX !== undefined && targetY !== undefined) {
            // Berechne Offset, um das Ziel ins Zentrum zu bringen
            offset_x = ZENTRUM - targetX;
            offset_y = ZENTRUM - targetY;
        }
    } else {
        // Kein Himmelskörper ausgewählt - zur Sonne zentrieren
        offset_x = 0;
        offset_y = 0;
    }
    scheduleUpdate();
}

// Verbesserte Max Realismus Funktion
function setZoomPreset(level) {
    if (level >= -30 && level <= 20) {
        // Pausiere Playback falls aktiv
        if (currentPlaybackMode) {
            stopPlayback();
        }

        zoom_level = level;

        if (selectedPlanet && (level === 20 || level === 3)) {
            // Bei Max Realismus oder Level 3: Zentriere auf ausgewählten Himmelskörper
            centerExactlyOnSelectedPlanet();
        } else if (!selectedPlanet && level <= 0) {
            // Nur wenn KEIN Himmelskörper ausgewählt ist: Zur Sonne zentrieren
            startAutoCenter();
        } else {
            // Andere Fälle: Einfacher Zoom ohne Zentrierung
            scheduleUpdate();
        }
    }
}

// Verbesserter Zentrier-Button
function centerOnPlanet() {
    if (selectedPlanet) {
        zoom_level = 3;
        centerExactlyOnSelectedPlanet();
    } else {
        // Kein Himmelskörper ausgewählt - zur Sonne zentrieren
        zoom_level = 3;
        scheduleUpdate();
    }
}

// Erweiterte Draw-Funktion für alle Ebenen
function drawPlanetenuhr(data) {
    const canvas = document.getElementById('planetCanvas');
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (data.ebene === 'sonnensystem') {
        drawSonnensystem(data, ctx);
    } else if (data.ebene === 'milchstrasse') {
        drawMilchstrasse(data, ctx);
    } else {
        drawGalaxien(data, ctx);
    }
}

function drawSonnensystem(data, ctx) {
    // Umlaufbahnen zeichnen
    data.umlaufbahnen.forEach(bahn => {
        if (bahn.radius > 0) {
            ctx.beginPath();
            ctx.arc(data.sonne.x, data.sonne.y, bahn.radius, 0, 2 * Math.PI);
            ctx.strokeStyle = 'rgba(128, 128, 128, 0.6)';
            ctx.setLineDash([2, 4]);
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.setLineDash([]);
        }
    });

    // Sonne zeichnen
    ctx.beginPath();
    ctx.arc(data.sonne.x, data.sonne.y, data.sonne.radius, 0, 2 * Math.PI);
    ctx.fillStyle = data.sonne.farbe;
    ctx.fill();
    ctx.strokeStyle = data.sonne.selected ? 'white' : 'orange';
    ctx.lineWidth = data.sonne.selected ? 3 : 1;
    ctx.stroke();

    // Planeten zeichnen
    data.planeten.forEach(planet => {
        // Linie zur Sonne
        ctx.beginPath();
        ctx.moveTo(data.sonne.x, data.sonne.y);
        ctx.lineTo(planet.x, planet.y);
        ctx.strokeStyle = planet.selected ? 'rgba(255, 255, 255, 0.8)' : 'rgba(105, 105, 105, 0.4)';
        ctx.setLineDash(planet.selected ? [] : [1, 3]);
        ctx.lineWidth = planet.selected ? 2 : 1;
        ctx.stroke();
        ctx.setLineDash([]);

        // Planeten-Punkt
        ctx.beginPath();
        ctx.arc(planet.x, planet.y, planet.point_radius, 0, 2 * Math.PI);
        ctx.fillStyle = planet.farbe;
        ctx.fill();
        ctx.strokeStyle = planet.selected ? 'white' : 'white';
        ctx.lineWidth = planet.selected ? 2 : 0.5;
        ctx.stroke();
    });

    // Zodiak-Kreis und Zeichen (immer anzeigen)
    if (data.zodiak && data.zodiak.show) {
        ctx.beginPath();
        ctx.arc(data.sonne.x, data.sonne.y, data.zodiak.radius, 0, 2 * Math.PI);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.lineWidth = 2;
        ctx.stroke();

        data.zodiak.zeichen.forEach(([name, degrees]) => {
            const angle_rad = Math.radians(degrees);
            const r1 = data.zodiak.radius;
            const r2 = data.zodiak.radius + 8;
            const r_text = data.zodiak.radius + 25;

            // Linien
            const x1 = data.sonne.x + r1 * Math.cos(angle_rad);
            const y1 = data.sonne.y - r1 * Math.sin(angle_rad);
            const x2 = data.sonne.x + r2 * Math.cos(angle_rad);
            const y2 = data.sonne.y - r2 * Math.sin(angle_rad);

            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.strokeStyle = 'rgba(255, 215, 0, 0.6)';
            ctx.lineWidth = 1;
            ctx.stroke();

            // Text
            const text_angle_rad = angle_rad + Math.radians(15);
            const text_x = data.sonne.x + r_text * Math.cos(text_angle_rad);
            const text_y = data.sonne.y - r_text * Math.sin(text_angle_rad);

            ctx.save();
            ctx.translate(text_x, text_y);
            ctx.rotate(-text_angle_rad + Math.PI);
            ctx.fillStyle = 'rgba(255, 215, 0, 0.8)';
            ctx.font = 'bold 10px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(name, 0, 0);
            ctx.restore();
        });

        // Zodiak-Linien für Planeten (deutlicher für sichtbare Planeten)
        data.planeten.forEach(planet => {
            const z_x = data.sonne.x + data.zodiak.radius * Math.cos(planet.helio_lon_rad);
            const z_y = data.sonne.y - data.zodiak.radius * Math.sin(planet.helio_lon_rad);

            ctx.beginPath();
            ctx.moveTo(planet.x, planet.y);
            ctx.lineTo(z_x, z_y);
            ctx.strokeStyle = planet.selected ? 'rgba(255, 255, 255, 0.8)' : 'rgba(255, 255, 255, 0.3)';
            ctx.lineWidth = planet.selected ? 2 : 1;
            ctx.stroke();

            // Planeten-Buchstabe
            ctx.fillStyle = planet.farbe;
            ctx.font = planet.selected ? 'bold 14px Arial' : 'bold 12px Arial';
            ctx.fillText(planet.name[0], z_x + 8, z_y + 4);
        });
    }
}

function drawMilchstrasse(data, ctx) {
    const relative_level = data.zoom_info ? data.zoom_info.relative_level : 0;

    // Zeichne Spiralarme bei höheren Zoom-Levels
    if (relative_level >= 5 && data.spiralarme) {
        data.spiralarme.forEach(arm => {
            const radius = (arm.entfernung_ly / data.zoom_info.max_entfernung) * (ZENTRUM - UMRANDE_GROESSE);
            ctx.beginPath();
            ctx.arc(data.sonne.x, data.sonne.y, radius, 0, 2 * Math.PI);
            ctx.strokeStyle = 'rgba(100, 100, 255, 0.3)';
            ctx.setLineDash([5, 15]);
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.setLineDash([]);

            // Arm-Beschriftung
            if (relative_level >= 7) {
                ctx.fillStyle = 'rgba(150, 150, 255, 0.8)';
                ctx.font = '10px Arial';
                ctx.fillText(arm.name, data.sonne.x + radius + 10, data.sonne.y);
            }
        });
    }

    // Zeichne Nachbarsterne
    if (data.sterne) {
        data.sterne.forEach(star => {
            ctx.beginPath();
            ctx.arc(star.x, star.y, star.radius, 0, 2 * Math.PI);
            ctx.fillStyle = star.farbe || 'white';
            ctx.fill();

            // Rand für ausgewählte Sterne
            ctx.strokeStyle = star.selected ? 'cyan' : 'rgba(255, 255, 255, 0.3)';
            ctx.lineWidth = star.selected ? 3 : 1;
            ctx.stroke();

            // Sternname (nur bei niedrigeren Zoom-Levels)
            if (relative_level <= 4 || star.selected) {
                ctx.fillStyle = 'white';
                ctx.font = '10px Arial';
                ctx.fillText(star.name, star.x + star.radius + 5, star.y);
            }
        });
    }

    // Zeichne Sonne in der Mitte
    ctx.beginPath();
    ctx.arc(data.sonne.x, data.sonne.y, data.sonne.radius, 0, 2 * Math.PI);
    ctx.fillStyle = data.sonne.farbe || 'yellow';
    ctx.fill();
    ctx.strokeStyle = data.sonne.selected ? 'cyan' : 'orange';
    ctx.lineWidth = data.sonne.selected ? 3 : 2;
    ctx.stroke();

    // Sonnen-Beschriftung
    ctx.fillStyle = 'yellow';
    ctx.font = 'bold 12px Arial';
    ctx.fillText(data.sonne.name, data.sonne.x + data.sonne.radius + 5, data.sonne.y);
}

function drawGalaxien(data, ctx) {
    // Zeichne Nachbargalaxien
    data.galaxien.forEach(galaxy => {
        ctx.beginPath();
        ctx.arc(galaxy.x, galaxy.y, galaxy.radius, 0, 2 * Math.PI);
        ctx.fillStyle = 'rgba(200, 200, 255, 0.7)';
        ctx.fill();
        ctx.strokeStyle = galaxy.selected ? 'cyan' : 'lightblue';
        ctx.lineWidth = galaxy.selected ? 3 : 1;
        ctx.stroke();

        // Galaxienname
        if (zoom_level >= -25) {
            ctx.fillStyle = 'white';
            ctx.font = '9px Arial';
            ctx.fillText(galaxy.name, galaxy.x + galaxy.radius + 5, galaxy.y);
        }
    });

    // Zeichne Milchstraße in der Mitte
    ctx.beginPath();
    ctx.arc(data.milchstrasse.x, data.milchstrasse.y, data.milchstrasse.radius, 0, 2 * Math.PI);
    ctx.fillStyle = 'rgba(255, 255, 200, 0.8)';
    ctx.fill();
    ctx.strokeStyle = data.milchstrasse.selected ? 'cyan' : 'yellow';
    ctx.lineWidth = data.milchstrasse.selected ? 3 : 2;
    ctx.stroke();
}

// Optimierte Auto-Center Funktion
function startAutoCenter() {
    autoCentering = true;
    const steps = 10;
    const step_x = offset_x / steps;
    const step_y = offset_y / steps;
    let currentStep = 0;

    function centerStep() {
        if (!autoCentering) return;

        offset_x -= step_x;
        offset_y -= step_y;
        currentStep++;

        if (currentStep >= steps || (Math.abs(offset_x) < 2 && Math.abs(offset_y) < 2)) {
            offset_x = 0;
            offset_y = 0;
            autoCentering = false;
            scheduleUpdate();
        } else {
            // Zeichne direkt ohne Server-Request für flüssige Animation
            if (currentPlanetData) {
                drawPlanetenuhr(currentPlanetData);
            }
            setTimeout(centerStep, 30);
        }
    }

    centerStep();
}

// Mouse Drag Funktionen
function setupMouseDrag() {
    const canvas = document.getElementById('planetCanvas');
    let isUpdating = false;

    canvas.addEventListener('mousedown', (e) => {
        isDragging = true;
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
        canvas.style.cursor = 'grabbing';
        // clearSelection(); // ENTFERNT - Auswahl bleibt beim Drag erhalten
    });

    canvas.addEventListener('mousemove', (e) => {
        if (!isDragging || isUpdating) return;

        const deltaX = e.clientX - lastMouseX;
        const deltaY = e.clientY - lastMouseY;

        offset_x += deltaX;
        offset_y += deltaY;

        lastMouseX = e.clientX;
        lastMouseY = e.clientY;

        // Zeichne direkt ohne Server-Request während Drag
        if (currentPlanetData) {
            drawPlanetenuhr(currentPlanetData);
        }
    });

    canvas.addEventListener('mouseup', () => {
        isDragging = false;
        canvas.style.cursor = 'pointer';
        scheduleUpdate(); // Nur ein Update am Ende
    });

    canvas.addEventListener('mouseleave', () => {
        if (isDragging) {
            isDragging = false;
            canvas.style.cursor = 'pointer';
            scheduleUpdate(); // Nur ein Update am Ende
        }
    });
}

// Verbesserte setupTouchDrag Funktion
function setupTouchDrag() {
    const canvas = document.getElementById('planetCanvas');
    let touchStartX = 0;
    let touchStartY = 0;
    let isTouchDragging = false;
    let lastTouchX = 0;
    let lastTouchY = 0;

    canvas.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) { // Nur bei einem Finger
            const touch = e.touches[0];
            touchStartX = touch.clientX;
            touchStartY = touch.clientY;
            lastTouchX = touch.clientX;
            lastTouchY = touch.clientY;
            isTouchDragging = true;
            // clearSelection(); // ENTFERNT - Auswahl bleibt beim Drag erhalten
        }
    });

    canvas.addEventListener('touchmove', (e) => {
        if (!isTouchDragging || e.touches.length !== 1) return;
        e.preventDefault();

        const touch = e.touches[0];
        const deltaX = touch.clientX - lastTouchX;
        const deltaY = touch.clientY - lastTouchY;

        offset_x += deltaX;
        offset_y += deltaY;

        lastTouchX = touch.clientX;
        lastTouchY = touch.clientY;

        // Zeichne direkt ohne Server-Request während Drag
        if (currentPlanetData) {
            drawPlanetenuhr(currentPlanetData);
        }
    });

    canvas.addEventListener('touchend', () => {
        if (isTouchDragging) {
            isTouchDragging = false;
            scheduleUpdate(); // Nur ein Update am Ende
        }
    });

    canvas.addEventListener('touchcancel', () => {
        isTouchDragging = false;
    });
}

// Verbesserte setupPlanetSelection Funktion
function setupPlanetSelection() {
    const canvas = document.getElementById('planetCanvas');

    // Mouse Events
    canvas.addEventListener('click', (e) => {
        if (isDragging) {
            isDragging = false;
            return;
        }

        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        selectPlanetByExactOrbit(x, y);
    });

    // Touch Events
    setupTouchSelection();
}

// Hilfsfunktion für Radiant
Math.radians = function(degrees) {
    return degrees * Math.PI / 180;
};

function updateStatus(status) {
    const statusElement = document.getElementById('status');
    const zoomDisplay = document.getElementById('zoomDisplay');

    if (status) {
        statusElement.textContent = `${status.modus_anzeige || 'UNBEKANNT'} | ${status.datum_uhrzeit_str || 'N/A'} | ${status.sonnen_radius_info || 'N/A'}`;
        zoomDisplay.textContent = `Level: ${status.zoom_level !== undefined ? status.zoom_level : zoom_level}`;
    } else {
        // Fallback wenn status undefined ist
        statusElement.textContent = `FEHLER | N/A | N/A`;
        zoomDisplay.textContent = `Level: ${zoom_level}`;
    }
}

function updatePlanetInfo(planetInfo, planetName) {
    const detailsDiv = document.getElementById('planetDetails');
    const defaultInfo = document.querySelector('.default-info');
    const infoTitle = document.getElementById('infoTitle');

    if (planetInfo && planetName) {
        // Zeige Planeten-Details
        defaultInfo.style.display = 'none';
        detailsDiv.style.display = 'block';
        infoTitle.textContent = planetName;

        detailsDiv.innerHTML = `
            <h4>Grunddaten</h4>
            <p><strong>Durchmesser:</strong> ${planetInfo.durchmesser_km.toLocaleString()} km</p>
            <p><strong>Abstand zur Sonne:</strong> ${planetInfo.abstand_ae} AE</p>
            <p><strong>Anzahl Monde:</strong> ${planetInfo.monde}</p>
            <p><strong>Rotation:</strong> ${planetInfo.rotation}</p>

            <h4>Oberfläche & Kern</h4>
            <p><strong>Oberfläche:</strong> ${planetInfo.oberflaeche}</p>
            <p><strong>Kern:</strong> ${planetInfo.kern}</p>

            <h4>Atmosphäre & Temperatur</h4>
            <p><strong>Atmosphäre:</strong> ${planetInfo.atmosphaere}</p>
            <p><strong>Temperatur:</strong> ${planetInfo.temperatur}</p>
            <p><strong>Temperatur-Details:</strong> ${planetInfo.temperatur_detail}</p>

            <h4>Elemente</h4>
            <p>${planetInfo.elemente}</p>

            <h4>Auffälligkeiten</h4>
            <p>${planetInfo.auffaelligkeiten}</p>
        `;
    } else {
        // Zeige Standard-Informationen
        defaultInfo.style.display = 'block';
        detailsDiv.style.display = 'none';
        infoTitle.textContent = 'Information';
    }
}

function clearSelection() {
    // Diese Funktion wird NUR aufgerufen wenn der Nutzer explizit eine Auswahl aufheben will
    // NICHT bei Zoom oder anderen Operationen
    selectedPlanet = null;
    updatePlanetData();
}

// Zeitsteuerungs-Funktionen
function handleUpdateClick() {
    // Aktualisiere currentDate basierend auf dem Eingabefeld
    const datumInput = document.getElementById('datumInput').value;
    try {
        currentDate = parseDateFromString(datumInput);
    } catch (error) {
        console.error('Fehler beim Parsen des Datums:', error);
        // Fallback: Aktuelle Zeit verwenden
        currentDate = new Date();
        document.getElementById('datumInput').value = formatDate(currentDate);
    }
    updatePlanetData();
}

function adjustTime(unit, amount) {
    // Verwende das aktuelle Datum aus dem Eingabefeld
    const currentInput = document.getElementById('datumInput').value;
    try {
        currentDate = parseDateFromString(currentInput);
    } catch (error) {
        currentDate = new Date();
    }

    if (unit === 'day') {
        currentDate.setDate(currentDate.getDate() + amount);
    } else if (unit === 'month') {
        currentDate.setMonth(currentDate.getMonth() + amount);
    } else if (unit === 'year') {
        currentDate.setFullYear(currentDate.getFullYear() + amount);
    }

    document.getElementById('datumInput').value = formatDate(currentDate);
    updatePlanetData();
}

function togglePlayback(mode, speed = 1) {
    if (currentPlaybackMode === mode && speed === (currentPlaybackMode === 'realtime' ? 1 : speed)) {
        stopPlayback();
        return;
    }

    stopPlayback();
    currentPlaybackMode = mode;

    const interval = PLAYBACK_SPEEDS[mode] || 500;

    playbackInterval = setInterval(() => {
        if (mode === 'realtime') {
            // Echtzeit: Immer aktuelle Zeit verwenden
            currentDate = new Date();
            document.getElementById('datumInput').value = formatDate(currentDate);
        } else {
            // Zeitmanipulation: Verwende das aktuelle Datum aus dem Eingabefeld
            const currentInput = document.getElementById('datumInput').value;
            try {
                currentDate = parseDateFromString(currentInput);
            } catch (error) {
                currentDate = new Date();
            }

            // Zeit anpassen
            if (mode === 'day') {
                currentDate.setDate(currentDate.getDate() + speed);
            } else if (mode === 'month') {
                currentDate.setMonth(currentDate.getMonth() + speed);
            } else if (mode === 'year') {
                currentDate.setFullYear(currentDate.getFullYear() + speed);
            }

            document.getElementById('datumInput').value = formatDate(currentDate);
        }

        updatePlanetData();
    }, interval);

    // UI-Status aktualisieren
    document.querySelectorAll('.play-btn').forEach(btn => btn.classList.remove('playing'));

    let buttonId;
    if (mode === 'realtime') {
        buttonId = 'playRealtime';
    } else {
        const direction = speed > 0 ? '' : 'Reverse';
        const speedLevel = Math.abs(speed) + 1;
        buttonId = `play${direction}${speedLevel}`;
    }

    document.getElementById(buttonId)?.classList.add('playing');
}

function stopPlayback() {
    if (playbackInterval) {
        clearInterval(playbackInterval);
        playbackInterval = null;
    }
    currentPlaybackMode = null;
    document.querySelectorAll('.play-btn').forEach(btn => btn.classList.remove('playing'));
}

// CSS für bessere Touch-Erfahrung hinzufügen
function addTouchStyles() {
    const style = document.createElement('style');
    style.textContent = `
        #planetCanvas {
            touch-action: pan-x pan-y;
            -webkit-tap-highlight-color: transparent;
        }

        @media (max-width: 768px) {
            button {
                min-height: 44px;
                min-width: 44px;
            }

            .play-btn.rounded {
                min-width: 44px;
                min-height: 44px;
                display: flex;
                align-items: center;
                justify-content: center;
            }

            .zoom-presets-row button {
                min-height: 36px;
                padding: 8px 10px;
            }
        }

        button:active, .play-btn.rounded:active {
            transform: scale(0.95);
            transition: transform 0.1s;
        }

        button {
            user-select: none;
            -webkit-user-select: none;
        }
    `;
    document.head.appendChild(style);
}

// VERBESSERTE Initialisierung - setzt korrektes Startdatum
document.addEventListener('DOMContentLoaded', function() {
    // Stelle sicher, dass das Eingabefeld das korrekte Startdatum hat
    document.getElementById('datumInput').value = formatDate(currentDate);
    setupMouseDrag();
    setupTouchDrag();
    setupPlanetSelection();
    addTouchStyles();
    updatePlanetData();
});
