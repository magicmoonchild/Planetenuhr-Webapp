import ephem
import math
from datetime import datetime, timedelta
from flask import Flask, render_template, request, jsonify

app = Flask(__name__, template_folder='templates')

# --- KONSTANTEN FÜR ALLE EBENEN ---
FENSTER_GROESSE = 600
ZENTRUM = FENSTER_GROESSE / 2
UMRANDE_GROESSE = 40

# --- SONNENSYSTEM EBENE (-10 bis +20) ---
ANZAHL_UMALUFBAHNEN = 9

# Echte Durchmesser in km
REALISTISCHE_DURCHMESSER_KM = {
    'Sonne': 1392000,
    'Merkur': 4880, 'Venus': 12104, 'Erde': 12756, 'Mars': 6779, 
    'Jupiter': 142984, 'Saturn': 120536, 'Uranus': 51118, 'Neptun': 49528, 'Pluto': 2377
}

# Echte Abstände in AE (von Sonnenmittelpunkt)
REALISTISCHE_ABSTAENDE_AE = {
    'Merkur': 0.387, 'Venus': 0.723, 'Erde': 1.000, 'Mars': 1.524, 
    'Jupiter': 5.204, 'Saturn': 9.582, 'Uranus': 19.201, 'Neptun': 30.047, 'Pluto': 39.482
}

# 1 AE in km
AE_IN_KM = 149597870.7
LICHTJAHR_IN_KM = 9460730472580.8
PARSEC_IN_LJ = 3.26156

# --- ERWEITERTE MILCHSTRASSEN EBENE ---
MILCHSTRASSE_STERNE = [
    # Nächste Nachbarn (bis 10 Lichtjahre)
    {'name': 'Proxima Centauri', 'entfernung_lj': 4.24, 'masse_sonne': 0.12, 'spektralklasse': 'M5.5Ve', 'planetensystem': True},
    {'name': 'Alpha Centauri A', 'entfernung_lj': 4.37, 'masse_sonne': 1.10, 'spektralklasse': 'G2V', 'planetensystem': True},
    {'name': 'Alpha Centauri B', 'entfernung_lj': 4.37, 'masse_sonne': 0.91, 'spektralklasse': 'K1V', 'planetensystem': True},
    {'name': 'Barnards Pfeilstern', 'entfernung_lj': 5.96, 'masse_sonne': 0.16, 'spektralklasse': 'M4Ve', 'planetensystem': True},
    {'name': 'Luhman 16', 'entfernung_lj': 6.50, 'masse_sonne': 0.04, 'spektralklasse': 'L7.5', 'planetensystem': False},
    {'name': 'WISE 0855-0714', 'entfernung_lj': 7.43, 'masse_sonne': 0.01, 'spektralklasse': 'Y2', 'planetensystem': False},
    {'name': 'Wolf 359', 'entfernung_lj': 7.86, 'masse_sonne': 0.09, 'spektralklasse': 'M6Ve', 'planetensystem': False},
    {'name': 'Lalande 21185', 'entfernung_lj': 8.31, 'masse_sonne': 0.39, 'spektralklasse': 'M2V', 'planetensystem': True},
    {'name': 'Sirius A', 'entfernung_lj': 8.60, 'masse_sonne': 2.02, 'spektralklasse': 'A1V', 'planetensystem': True},
    {'name': 'Sirius B', 'entfernung_lj': 8.60, 'masse_sonne': 0.98, 'spektralklasse': 'DA2', 'planetensystem': False},
    
    # Wichtige Tierkreis-Sterne
    {'name': 'Regulus', 'entfernung_lj': 79.3, 'masse_sonne': 3.5, 'spektralklasse': 'B7V', 'planetensystem': False},
    {'name': 'Aldebaran', 'entfernung_lj': 65.3, 'masse_sonne': 1.5, 'spektralklasse': 'K5III', 'planetensystem': False},
    {'name': 'Spica', 'entfernung_lj': 250, 'masse_sonne': 11.4, 'spektralklasse': 'B1III', 'planetensystem': False},
    {'name': 'Antares', 'entfernung_lj': 550, 'masse_sonne': 12.4, 'spektralklasse': 'M1I', 'planetensystem': False},
    {'name': 'Vega', 'entfernung_lj': 25.0, 'masse_sonne': 2.1, 'spektralklasse': 'A0V', 'planetensystem': True},
    {'name': 'Altair', 'entfernung_lj': 16.7, 'masse_sonne': 1.8, 'spektralklasse': 'A7V', 'planetensystem': False},
    
    # Weitere bedeutende Sterne
    {'name': 'Arcturus', 'entfernung_lj': 36.7, 'masse_sonne': 1.1, 'spektralklasse': 'K1.5III', 'planetensystem': False},
    {'name': 'Capella', 'entfernung_lj': 42.9, 'masse_sonne': 2.6, 'spektralklasse': 'G3III', 'planetensystem': False},
    {'name': 'Rigel', 'entfernung_lj': 860, 'masse_sonne': 21, 'spektralklasse': 'B8Ia', 'planetensystem': False},
    {'name': 'Betelgeuse', 'entfernung_lj': 640, 'masse_sonne': 11.6, 'spektralklasse': 'M1I', 'planetensystem': False}
]

# Spiralarme der Milchstraße
SPIRALARME = [
    {'name': 'Scutum-Centaurus-Arm', 'entfernung_ly': 30000, 'breite_ly': 2000},
    {'name': 'Perseus-Arm', 'entfernung_ly': 40000, 'breite_ly': 2000},
    {'name': 'Sagittarius-Arm', 'entfernung_ly': 25000, 'breite_ly': 2000},
    {'name': 'Orion-Arm (Lokal)', 'entfernung_ly': 26000, 'breite_ly': 2000},
    {'name': 'Norma-Arm', 'entfernung_ly': 35000, 'breite_ly': 2000}
]

# --- GALAXIEN EBENE (-21 bis -30) ---
LOKALE_GRUPPE = [
    {'name': 'Andromeda-Galaxie', 'entfernung_lj': 2537000, 'durchmesser_lj': 152000, 'sterne': 1000000000000},
    {'name': 'Dreiecksgalaxie', 'entfernung_lj': 2730000, 'durchmesser_lj': 60000, 'sterne': 40000000000},
    {'name': 'Große Magellansche Wolke', 'entfernung_lj': 163000, 'durchmesser_lj': 14000, 'sterne': 30000000000},
    {'name': 'Kleine Magellansche Wolke', 'entfernung_lj': 200000, 'durchmesser_lj': 7000, 'sterne': 7000000000},
    {'name': 'Messier 32', 'entfernung_lj': 2560000, 'durchmesser_lj': 6500, 'sterne': 3000000000},
    {'name': 'Messier 110', 'entfernung_lj': 2680000, 'durchmesser_lj': 15000, 'sterne': 10000000000},
    {'name': 'NGC 147', 'entfernung_lj': 2360000, 'durchmesser_lj': 11000, 'sterne': 10000000000},
    {'name': 'NGC 185', 'entfernung_lj': 2010000, 'durchmesser_lj': 10000, 'sterne': 8000000000},
    {'name': 'IC 10', 'entfernung_lj': 2200000, 'durchmesser_lj': 5000, 'sterne': 20000000000},
    {'name': 'Leo I', 'entfernung_lj': 820000, 'durchmesser_lj': 2000, 'sterne': 33000000}
]

# Vollständige Planeten-Informationen
PLANETEN_INFO = {
    'Sonne': {
        'durchmesser_km': 1392000,
        'abstand_ae': 0,
        'monde': 0,
        'planeten': 8,
        'oberflaeche': 'Plasma',
        'kern': 'Wasserstoff-Helium-Fusion (15 Mio°C)',
        'atmosphaere': 'Korona (1-3 Mio°C), Chromosphäre (6.000-50.000°C), Photosphäre (5.500°C)',
        'temperatur': '5.500°C (Oberfläche), 15 Mio°C (Kern)',
        'temperatur_detail': 'Sonnenflecken: 3.500°C, Umgebung: 5.500°C, Kern: 15 Mio°C',
        'elemente': 'Wasserstoff (73%), Helium (25%), andere (2%)',
        'rotation': '25-35 Tage (differentielle Rotation)',
        'auffaelligkeiten': 'Sonnenfleckenzyklus: 11 Jahre, Koronale Massenauswürfe'
    },
    'Merkur': {
        'durchmesser_km': 4880,
        'abstand_ae': 0.387,
        'monde': 0,
        'planeten': 0,
        'oberflaeche': 'Felsig mit Kratern',
        'kern': 'Eisen (75% des Radius)',
        'atmosphaere': 'Exosphäre mit Spuren von Sauerstoff, Natrium, Wasserstoff',
        'temperatur': '-173°C bis 427°C',
        'temperatur_detail': 'Tagesseite: bis 427°C, Nachtseite: bis -173°C',
        'elemente': 'Eisen (70%), Sauerstoff, Silizium, Magnesium',
        'rotation': '58,6 Erdentage',
        'auffaelligkeiten': 'Größte Temperaturschwankungen, keine Atmosphäre'
    },
    'Venus': {
        'durchmesser_km': 12104,
        'abstand_ae': 0.723,
        'monde': 0,
        'planeten': 0,
        'oberflaeche': 'Vulkanisches Gestein mit Bergen und Tälern',
        'kern': 'Eisen-Nickel-Kern',
        'atmosphaere': 'Dichte CO₂-Atmosphäre (96.5%) mit Schwefelsäurewolken',
        'temperatur': '462°C konstant',
        'temperatur_detail': 'Oberfläche: 462°C, gleichmäßig durch Treibhauseffekt',
        'elemente': 'Kohlendioxid (96.5%), Stickstoff (3.5%)',
        'rotation': '243 Erdentage (rückläufig)',
        'auffaelligkeiten': 'Extremer Treibhauseffekt, längster Tag im Sonnensystem'
    },
    'Erde': {
        'durchmesser_km': 12756,
        'abstand_ae': 1.000,
        'monde': 1,
        'planeten': 0,
        'oberflaeche': 'Wasser (71%) und Land (29%)',
        'kern': 'Eisen-Nickel-Kern (bis zu 6.000°C)',
        'atmosphaere': 'Stickstoff (78%), Sauerstoff (21%), Argon (0.9%)',
        'temperatur': 'Durchschnittlich 15°C',
        'temperatur_detail': '-89°C bis +58°C (Extreme), Durchschnitt: 15°C',
        'elemente': 'Eisen (32%), Sauerstoff (30%), Silizium (15%), Magnesium (14%)',
        'rotation': '23h 56m 4s',
        'auffaelligkeiten': 'Einziger bekannter Planet mit Leben, Plattentektonik'
    },
    'Mars': {
        'durchmesser_km': 6779,
        'abstand_ae': 1.524,
        'monde': 2,
        'planeten': 0,
        'oberflaeche': 'Rötlicher Sand und Felsen',
        'kern': 'Eisen mit Schwefel',
        'atmosphaere': 'Dünne CO₂-Atmosphäre (95%)',
        'temperatur': '-125°C bis 20°C',
        'temperatur_detail': 'Durchschnitt: -63°C, Pole: bis -125°C, Äquator: bis 20°C',
        'elemente': 'Eisenoxid (rostiger Sand), Silikate',
        'rotation': '24h 37m 22s',
        'auffaelligkeiten': 'Größter Vulkan (Olympus Mons), tiefste Schluchten'
    },
    'Jupiter': {
        'durchmesser_km': 142984,
        'abstand_ae': 5.204,
        'monde': 95,
        'planeten': 0,
        'oberflaeche': 'Gasplanet ohne feste Oberfläche',
        'kern': 'Felsiger Kern umgeben metallischer Wasserstoff',
        'atmosphaere': 'Wasserstoff (90%), Helium (10%) mit Ammoniakwolken',
        'temperatur': '-108°C (Wolkenoberkante)',
        'temperatur_detail': 'Wolken: -108°C, Kern: bis 24.000°C',
        'elemente': 'Wasserstoff (90%), Helium (10%)',
        'rotation': '9h 55m 30s',
        'auffaelligkeiten': 'Großer Roter Fleck, stärkstes Magnetfeld'
    },
    'Saturn': {
        'durchmesser_km': 120536,
        'abstand_ae': 9.582,
        'monde': 146,
        'planeten': 0,
        'oberflaeche': 'Gasplanet ohne feste Oberfläche',
        'kern': 'Felsiger Kern mit Eis',
        'atmosphaere': 'Wasserstoff (96%), Helium (3%)',
        'temperatur': '-139°C (Wolkenoberkante)',
        'temperatur_detail': 'Wolken: -139°C, Kern: bis 11.700°C',
        'elemente': 'Wasserstoff (96%), Helium (3%), Methan, Ammoniak',
        'rotation': '10h 42m',
        'auffaelligkeiten': 'Ausgeprägtes Ringsystem, niedrigste Dichte'
    },
    'Uranus': {
        'durchmesser_km': 51118,
        'abstand_ae': 19.201,
        'monde': 28,
        'planeten': 0,
        'oberflaeche': 'Eisplanet mit flüssigem Mantel',
        'kern': 'Felsiger Kern',
        'atmosphaere': 'Wasserstoff (83%), Helium (15%), Methan (2%)',
        'temperatur': '-197°C',
        'temperatur_detail': 'Durchschnitt: -197°C, Kern: bis 5.000°C',
        'elemente': 'Wasserstoff, Helium, Methan, Wasser, Ammoniak',
        'rotation': '17h 14m (seitliche Achse)',
        'auffaelligkeiten': 'Rotationsachse liegt fast in der Bahnebene'
    },
    'Neptun': {
        'durchmesser_km': 49528,
        'abstand_ae': 30.047,
        'monde': 16,
        'planeten': 0,
        'oberflaeche': 'Eisplanet mit flüssigem Mantel',
        'kern': 'Felsiger Kern',
        'atmosphaere': 'Wasserstoff (80%), Helium (19%), Methan (1%)',
        'temperatur': '-201°C',
        'temperatur_detail': 'Durchschnitt: -201°C, Kern: bis 5.000°C',
        'elemente': 'Wasserstoff, Helium, Methan, Wasser, Ammoniak',
        'rotation': '16h 6m',
        'auffaelligkeiten': 'Stärkste Winde (2.100 km/h), Großer Dunkler Fleck'
    },
    'Pluto': {
        'durchmesser_km': 2377,
        'abstand_ae': 39.482,
        'monde': 5,
        'planeten': 0,
        'oberflaeche': 'Eis mit Stickstoff, Methan und Kohlenmonoxid',
        'kern': 'Felsiger Kern',
        'atmosphaere': 'Dünne Atmosphäre aus Stickstoff, Methan, Kohlenmonoxid',
        'temperatur': '-229°C bis -223°C',
        'temperatur_detail': 'Durchschnitt: -229°C, je nach Sonnennähe',
        'elemente': 'Stickstoffeis, Methaneis, Wassereis, Gestein',
        'rotation': '6 Tage 9h 17m',
        'auffaelligkeiten': 'Exzentrische Bahn, Zwergplanet-Status'
    }
}

PLANETEN_FARBEN = {
    'Sonne': 'yellow', 'Merkur': 'grey', 'Venus': 'orange', 'Erde': 'green',
    'Mars': 'red', 'Jupiter': 'brown', 'Saturn': 'tan',
    'Uranus': 'lightblue', 'Neptun': 'blue', 'Pluto': 'purple'
}

HELIOCENTRIC_OBJEKTE = {
    'Merkur': ephem.Mercury, 'Venus': ephem.Venus, 'Mars': ephem.Mars,
    'Jupiter': ephem.Jupiter, 'Saturn': ephem.Saturn, 'Uranus': ephem.Uranus,
    'Neptun': ephem.Neptune, 'Pluto': ephem.Pluto, 'Sonne_Geo': ephem.Sun 
}

BAHNEN_INDEX = {
    'Merkur': 1, 'Venus': 2, 'Erde': 3, 'Mars': 4, 
    'Jupiter': 5, 'Saturn': 6, 'Uranus': 7, 'Neptun': 8, 'Pluto': 9
}

ZODIAC_ZEICHEN = [
    ("Widder", 0), ("Stier", 30), ("Zwillinge", 60), ("Krebs", 90), 
    ("Löwe", 120), ("Jungfrau", 150), ("Waage", 180), ("Skorpion", 210), 
    ("Schütze", 240), ("Steinbock", 270), ("Wassermann", 300), ("Fische", 330)
]

# Zoom Konstanten
ZOOM_STEP_FACTOR_OUT = 1.1
ZOOM_AGGRESSIVE_BASE_IN = 1.5

def get_current_level_range(zoom_level):
    """Bestimmt die aktuelle Ebene basierend auf Zoom-Level"""
    if zoom_level >= -10:
        return 'sonnensystem'
    elif zoom_level >= -20:
        return 'milchstrasse'
    else:
        return 'galaxien'

def calculate_scaling_factors(zoom_level):
    """Berechnet Zoom-Faktoren basierend auf Level und Ebene"""
    current_range = get_current_level_range(zoom_level)
    
    if current_range == 'sonnensystem':
        if zoom_level <= 0:
            orbit_zoom_faktor = 1.0
            zoom_faktor_display = ZOOM_STEP_FACTOR_OUT ** zoom_level
        else:
            orbit_zoom_faktor = ZOOM_AGGRESSIVE_BASE_IN ** zoom_level
            zoom_faktor_display = orbit_zoom_faktor
    
    elif current_range == 'milchstrasse':
        # Für Milchstraßen-Ebene: Level -11 bis -20
        relative_level = zoom_level + 11  # 0 bis 9
        orbit_zoom_faktor = ZOOM_STEP_FACTOR_OUT ** (relative_level * 2)
        zoom_faktor_display = orbit_zoom_faktor
    
    else:  # galaxien
        # Für Galaxien-Ebene: Level -21 bis -30
        relative_level = zoom_level + 21  # 0 bis 9
        orbit_zoom_faktor = ZOOM_STEP_FACTOR_OUT ** (relative_level * 3)
        zoom_faktor_display = orbit_zoom_faktor
    
    return orbit_zoom_faktor, zoom_faktor_display

def get_sonnen_radius(zoom_level):
    """Berechnet Sonnenradius mit sanfter Skalierung"""
    orbit_zoom_faktor, _ = calculate_scaling_factors(zoom_level)
    
    # Basis Sonnengröße für realistischen Modus
    sonnen_durchmesser_ae = REALISTISCHE_DURCHMESSER_KM['Sonne'] / AE_IN_KM
    basis_skalierung = (ZENTRUM - UMRANDE_GROESSE) / REALISTISCHE_ABSTAENDE_AE['Pluto']
    basis_sonnen_radius = sonnen_durchmesser_ae * basis_skalierung / 2
    
    if zoom_level <= 0:
        basis_groesse = 10.5
        if zoom_level >= -10:
            progress = (zoom_level + 10) / 10
            return basis_groesse + (progress * 2)
        return basis_groesse
    else:
        return max(basis_sonnen_radius * (1 + (zoom_level ** 1.5) * 0.1), 12.5)

def get_planet_diameter(name, zoom_level):
    """Berechnet Planetendurchmesser mit fließenden Übergängen"""
    if zoom_level <= -10:
        return 8.0
    
    if zoom_level <= 0:
        progress = (zoom_level + 10) / 10
        didaktische_groesse = 8.0
        
        sonnen_durchmesser_km = REALISTISCHE_DURCHMESSER_KM['Sonne']
        planet_durchmesser_km = REALISTISCHE_DURCHMESSER_KM.get(name, 0)
        groessen_verhaeltnis = planet_durchmesser_km / sonnen_durchmesser_km
        
        basis_sonnen_radius = get_sonnen_radius(zoom_level)
        realistischer_durchmesser = groessen_verhaeltnis * basis_sonnen_radius * 2
        
        return didaktische_groesse * (1 - progress) + max(realistischer_durchmesser, 3) * progress
    
    sonnen_durchmesser_km = REALISTISCHE_DURCHMESSER_KM['Sonne']
    planet_durchmesser_km = REALISTISCHE_DURCHMESSER_KM.get(name, 0)
    groessen_verhaeltnis = planet_durchmesser_km / sonnen_durchmesser_km
    
    basis_sonnen_radius = get_sonnen_radius(zoom_level)
    realistischer_durchmesser = groessen_verhaeltnis * basis_sonnen_radius * 2
    
    return max(realistischer_durchmesser, 2)

def get_radius_for_planet(name, zoom_level, sonnen_radius):
    """Berechnet Bahnradius mit fließendem Übergang zu realistischen Abständen"""
    orbit_zoom_faktor, _ = calculate_scaling_factors(zoom_level)
    
    if zoom_level <= 0:
        progress = (zoom_level + 10) / 10
        
        index = BAHNEN_INDEX.get(name, 0)
        didaktischer_radius = sonnen_radius + (index * (ZENTRUM - UMRANDE_GROESSE - sonnen_radius) / ANZAHL_UMALUFBAHNEN)
        
        abstand_ae = REALISTISCHE_ABSTAENDE_AE.get(name, 0)
        max_abstand_ae = REALISTISCHE_ABSTAENDE_AE['Pluto']
        skalierungsfaktor = (ZENTRUM - UMRANDE_GROESSE - sonnen_radius) / max_abstand_ae
        realistischer_radius = sonnen_radius + abstand_ae * skalierungsfaktor
        
        radius = didaktischer_radius * (1 - progress) + realistischer_radius * progress
    else:
        abstand_ae = REALISTISCHE_ABSTAENDE_AE.get(name, 0)
        max_abstand_ae = REALISTISCHE_ABSTAENDE_AE['Pluto']
        skalierungsfaktor = (ZENTRUM - UMRANDE_GROESSE - sonnen_radius) / max_abstand_ae
        radius = sonnen_radius + abstand_ae * skalierungsfaktor
    
    return radius * orbit_zoom_faktor

def get_stern_farbe(spektralklasse):
    """Bestimmt Sternfarbe basierend auf Spektralklasse"""
    if spektralklasse.startswith('O'): return '#9bb0ff'  # Blau
    elif spektralklasse.startswith('B'): return '#aabfff'  # Blau-Weiß
    elif spektralklasse.startswith('A'): return '#cad7ff'  # Weiß
    elif spektralklasse.startswith('F'): return '#f8f7ff'  # Gelb-Weiß
    elif spektralklasse.startswith('G'): return '#fff4ea'  # Gelb (wie Sonne)
    elif spektralklasse.startswith('K'): return '#ffd2a1'  # Orange
    elif spektralklasse.startswith('M'): return '#ffcc6f'  # Rot-Orange
    else: return '#ffffff'  # Standard

def calculate_milchstrasse_data(zoom_level, offset_x, offset_y, selected_star=None):
    """Berechnet die Milchstraßen-Ebene mit realistischer Sternverteilung"""
    relative_level = zoom_level + 11  # -11 bis -20 → 0 bis 9
    
    # Skalierungsfaktoren basierend auf Zoom-Level
    if relative_level <= 3:  # Level -11 bis -14: Lokale Nachbarn
        max_entfernung = 100  # Lichtjahre
        base_scale = (ZENTRUM - UMRANDE_GROESSE) / max_entfernung
        anzuzeigende_sterne = [s for s in MILCHSTRASSE_STERNE if s['entfernung_lj'] <= max_entfernung]
    elif relative_level <= 6:  # Level -15 bis -17: Orion-Arm
        max_entfernung = 1000  # Lichtjahre
        base_scale = (ZENTRUM - UMRANDE_GROESSE) / max_entfernung
        anzuzeigende_sterne = [s for s in MILCHSTRASSE_STERNE if s['entfernung_lj'] <= max_entfernung]
    else:  # Level -18 bis -20: Ganze Milchstraße
        max_entfernung = 50000  # Lichtjahre
        base_scale = (ZENTRUM - UMRANDE_GROESSE) / max_entfernung
        # Für die Übersicht zeigen wir nur bedeutende Sterne
        anzuzeigende_sterne = [s for s in MILCHSTRASSE_STERNE if s['masse_sonne'] > 1.0 or s['entfernung_lj'] < 50]
    
    sterne = []
    
    for stern in anzuzeigende_sterne:
        # Vereinfachte Positionierung (in einer realen Implementierung würden wir RA/Dec verwenden)
        # Für Demo: Zufällige Winkel, aber mit korrekten Entfernungen
        angle = hash(stern['name']) % 360  # Pseudo-zufälliger Winkel basierend auf Namen
        radius = (stern['entfernung_lj'] / max_entfernung) * base_scale * (ZENTRUM - UMRANDE_GROESSE)
        
        # Zoom-Faktor anwenden
        zoom_faktor = ZOOM_STEP_FACTOR_OUT ** (relative_level * 2)
        radius *= zoom_faktor
        
        x = ZENTRUM + offset_x + radius * math.cos(math.radians(angle))
        y = ZENTRUM + offset_y + radius * math.sin(math.radians(angle))
        
        # Sterngröße basierend auf Masse und Zoom-Level
        if relative_level <= 3:
            groesse = max(3, stern['masse_sonne'] * 6)
        elif relative_level <= 6:
            groesse = max(2, stern['masse_sonne'] * 4)
        else:
            groesse = max(1, stern['masse_sonne'] * 2)
        
        # Farbe basierend auf Spektralklasse
        farbe = get_stern_farbe(stern['spektralklasse'])
        
        sterne.append({
            'name': stern['name'],
            'x': x,
            'y': y,
            'radius': groesse,
            'farbe': farbe,
            'entfernung_lj': stern['entfernung_lj'],
            'masse_sonne': stern['masse_sonne'],
            'spektralklasse': stern['spektralklasse'],
            'planetensystem': stern['planetensystem'],
            'selected': (stern['name'] == selected_star)
        })
    
    return {
        'ebene': 'milchstrasse',
        'sterne': sterne,
        'sonne': {
            'name': 'Sonne',
            'x': ZENTRUM + offset_x,
            'y': ZENTRUM + offset_y,
            'radius': 8,
            'farbe': 'yellow',
            'selected': ('Sonne' == selected_star)
        },
        'spiralarme': SPIRALARME if relative_level >= 5 else [],
        'zoom_info': {
            'max_entfernung': max_entfernung,
            'relative_level': relative_level,
            'anzahl_sterne': len(sterne)
        }
    }

def calculate_galaxien_data(zoom_level, offset_x, offset_y, selected_galaxie=None):
    """Berechnet die Galaxien-Ebene mit Nachbargalaxien"""
    relative_level = zoom_level + 21  # 0 bis 9
    base_scale = (ZENTRUM - UMRANDE_GROESSE) / 3000000  # 3 Mio Lichtjahre Basis
    
    galaxien = []
    
    for i, galaxie in enumerate(LOKALE_GRUPPE):
        # Position im Kreis um die Milchstraße
        angle = (i / len(LOKALE_GRUPPE)) * 2 * math.pi
        radius = (galaxie['entfernung_lj'] / 3000000) * base_scale * (ZOOM_STEP_FACTOR_OUT ** (relative_level * 2))
        
        x = ZENTRUM + offset_x + radius * math.cos(angle)
        y = ZENTRUM + offset_y + radius * math.sin(angle)
        
        # Galaxie-Größe basierend auf Durchmesser
        groesse = max(5, math.log(galaxie['durchmesser_lj']) * 2)
        
        galaxien.append({
            'name': galaxie['name'],
            'x': x,
            'y': y,
            'radius': groesse,
            'entfernung_lj': galaxie['entfernung_lj'],
            'durchmesser_lj': galaxie['durchmesser_lj'],
            'sterne_anzahl': galaxie['sterne'],
            'selected': (galaxie['name'] == selected_galaxie)
        })
    
    return {
        'ebene': 'galaxien',
        'galaxien': galaxien,
        'milchstrasse': {
            'name': 'Milchstraße',
            'x': ZENTRUM + offset_x,
            'y': ZENTRUM + offset_y,
            'radius': 15,
            'selected': ('Milchstraße' == selected_galaxie)
        }
    }

def calculate_sonnensystem_data(datum_uhrzeit_str, zoom_level, offset_x, offset_y, selected_planet=None):
    """Berechnet Sonnensystem-Daten separat"""
    try:
        beobachtungszeit = ephem.Date(datum_uhrzeit_str)
    except:
        beobachtungszeit = ephem.Date(datetime.now().strftime("%Y/%m/%d %H:%M:%S"))
    
    center_x = ZENTRUM + offset_x
    center_y = ZENTRUM + offset_y

    sonnen_radius = get_sonnen_radius(zoom_level)

    planeten = []
    umlaufbahnen = []
    
    show_outer_orbits = zoom_level <= 15
    planet_names = ['Merkur', 'Venus', 'Erde', 'Mars', 'Jupiter', 'Saturn']
    if show_outer_orbits:
        planet_names.extend(['Uranus', 'Neptun', 'Pluto'])
    
    for name in planet_names:
        radius = get_radius_for_planet(name, zoom_level, sonnen_radius)
        umlaufbahnen.append({'name': name, 'radius': radius})

    max_visible_radius = get_radius_for_planet('Pluto', zoom_level, sonnen_radius) if show_outer_orbits else get_radius_for_planet('Saturn', zoom_level, sonnen_radius)
    zodiak_radius = max_visible_radius + UMRANDE_GROESSE

    for name_key, planet_class in HELIOCENTRIC_OBJEKTE.items():
        name_zur_anzeige = name_key
        
        if name_key == 'Sonne_Geo':
            try:
                obj = planet_class()
                obj.compute(beobachtungszeit)
                helio_lon_rad = obj.hlong - math.pi  
                name_key_orbit = 'Erde'
                farbe = PLANETEN_FARBEN['Erde']
                name_zur_anzeige = 'Erde'
            except:
                continue
        else:
            try:
                obj = planet_class(beobachtungszeit) 
                helio_lon_rad = obj.hlong 
                name_key_orbit = name_key
                farbe = PLANETEN_FARBEN[name_key]
            except:
                continue
        
        if not show_outer_orbits and name_key_orbit in ['Uranus', 'Neptun', 'Pluto']:
            continue
            
        orbit_radius = get_radius_for_planet(name_key_orbit, zoom_level, sonnen_radius)
        point_radius = get_planet_diameter(name_key_orbit, zoom_level) / 2
        
        angle_rad = float(helio_lon_rad)
        x = center_x + orbit_radius * math.cos(angle_rad)
        y = center_y - orbit_radius * math.sin(angle_rad)

        planeten.append({
            'name': name_zur_anzeige,
            'x': x,
            'y': y,
            'point_radius': point_radius,
            'farbe': farbe,
            'orbit_radius': orbit_radius,
            'helio_lon_rad': angle_rad,
            'selected': (name_zur_anzeige == selected_planet)
        })

    if zoom_level <= -5:
        modus_anzeige = "DIDAKTISCH"
    elif zoom_level <= 0:
        modus_anzeige = "ÜBERGANG"
    elif zoom_level <= 10:
        modus_anzeige = "REALISTISCH"
    else:
        modus_anzeige = "MAX REALISMUS"

    return {
        'ebene': 'sonnensystem',
        'sonne': {
            'radius': sonnen_radius,
            'x': center_x,
            'y': center_y,
            'farbe': PLANETEN_FARBEN['Sonne'],
            'selected': ('Sonne' == selected_planet)
        },
        'planeten': planeten,
        'umlaufbahnen': umlaufbahnen,
        'zodiak': {
            'radius': zodiak_radius,
            'zeichen': ZODIAC_ZEICHEN,
            'show': zoom_level <= 3
        },
        'selected_planet_info': PLANETEN_INFO.get(selected_planet) if selected_planet else None,
        'status': {
            'zoom_level': zoom_level,
            'modus_anzeige': modus_anzeige,
            'datum_uhrzeit_str': datum_uhrzeit_str,
            'sonnen_radius_info': f"Sonne: {sonnen_radius*2:.1f}px",
            'selected_planet': selected_planet
        }
    }

def calculate_planet_data(datum_uhrzeit_str, zoom_level, offset_x, offset_y, selected_planet=None):
    """Berechnet alle Planetenpositionen - mit korrigierter Ebenen-Logik"""
    current_range = get_current_level_range(zoom_level)
    
    # DEBUG: Ausgabe für Zoom-Level
    print(f"DEBUG: Zoom Level: {zoom_level}, Range: {current_range}")
    
    if current_range == 'milchstrasse':
        return calculate_milchstrasse_data(zoom_level, offset_x, offset_y, selected_planet)
    elif current_range == 'galaxien':
        return calculate_galaxien_data(zoom_level, offset_x, offset_y, selected_planet)
    else:
        # Sonnensystem
        return calculate_sonnensystem_data(datum_uhrzeit_str, zoom_level, offset_x, offset_y, selected_planet)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/planet_data', methods=['POST'])
def get_planet_data():
    data = request.json
    datum_uhrzeit_str = data.get('datum', datetime.now().strftime("%Y/%m/%d %H:%M:%S"))
    zoom_level = data.get('zoom_level', -10)
    offset_x = data.get('offset_x', 0)
    offset_y = data.get('offset_y', 0)
    selected_planet = data.get('selected_planet')
    
    try:
        planet_data = calculate_planet_data(datum_uhrzeit_str, zoom_level, offset_x, offset_y, selected_planet)
        return jsonify(planet_data)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/favicon.ico')
def favicon():
    return '', 204

if __name__ == '__main__':
    app.run(debug=True)

application = app
