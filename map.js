let map;
let markers = [];
let circles = [];
let currentInfoWindow = null;
let totalResults = 0;
let isEmptyZoneMode = false;
let emptyZoneMarkers = [];
let clickListener = null;

// Variables pour la mesure de distance
let isDistanceMode = false;
let distanceMarkers = [];
let distanceLine = null;
let distanceInfoWindow = null;

function initMap() {
    map = new google.maps.Map(document.getElementById('map'), {
        center: config.mapSettings.center,
        zoom: config.mapSettings.zoom,
        styles: [
            {
                featureType: "poi",
                elementType: "labels",
                stylers: [{ visibility: "off" }]
            }
        ]
    });
}

function searchVisibleArea() {
    if (map.getZoom() < config.minZoomLevel) {
        alert(`Veuillez zoomer davantage pour une recherche plus précise (niveau de zoom minimum : ${config.minZoomLevel})`);
        return;
    }

    const bounds = map.getBounds();
    const searchPoints = getSearchPoints(bounds);

    searchPoints.forEach(point => {
        const request = {
            location: point,
            radius: config.searchRadius,
            keyword: 'pharmacie',
            type: 'pharmacy'
        };

        const service = new google.maps.places.PlacesService(map);
        service.nearbySearch(request, (results, status) => {
            if (status === google.maps.places.PlacesServiceStatus.OK && results) {
                results.forEach(place => {
                    if (bounds.contains(place.geometry.location) &&
                        !isPharmacyExists(place.geometry.location)) {
                        createMarkerWithDetails(place);
                        totalResults++;
                        updateStats();
                    }
                });
            }
        });
    });
}

function toggleEmptyZoneMode() {
    // Désactiver le mode distance s'il est actif
    if (isDistanceMode) toggleDistanceMode();

    isEmptyZoneMode = !isEmptyZoneMode;
    const btn = document.getElementById('addEmptyZoneBtn');
    const modeInfo = document.getElementById('mode-info');

    if (isEmptyZoneMode) {
        btn.classList.add('active');
        modeInfo.innerHTML = '<i class="fas fa-info-circle"></i> Cliquez sur la carte pour marquer une zone sans pharmacie';
        modeInfo.style.display = 'block';
        map.setOptions({draggableCursor: 'crosshair'});

        clickListener = map.addListener('click', handleMapClick);
    } else {
        btn.classList.remove('active');
        modeInfo.style.display = 'none';
        map.setOptions({draggableCursor: null});

        if (clickListener) {
            google.maps.event.removeListener(clickListener);
            clickListener = null;
        }
    }
}

function handleMapClick(event) {
    if (isEmptyZoneMode) {
        addEmptyZoneMarker(event.latLng);
    }
}

function addEmptyZoneMarker(location) {
    const marker = new google.maps.Marker({
        position: location,
        map: map,
        icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 10,
            fillColor: '#28a745',
            fillOpacity: 0.7,
            strokeColor: '#28a745',
            strokeWeight: 2
        },
        title: 'Zone sans pharmacie'
    });

    const circle = new google.maps.Circle({
        map: map,
        center: location,
        radius: 300,
        fillColor: '#28a745',
        fillOpacity: 0.1,
        strokeColor: '#28a745',
        strokeWeight: 1 ,
         clickable: false
    });

    const lat = location.lat().toFixed(6);
    const lng = location.lng().toFixed(6);

    const index = emptyZoneMarkers.length;
    const infowindow = new google.maps.InfoWindow({
        content: `
            <div class="pharmacy-info">
                <h3>Zone sans pharmacie</h3>
                <p>Zone identifiée manuellement comme n'ayant pas de pharmacie dans un rayon de 300m</p>
                <p><strong>Coordonnées GPS:</strong></p>
                <p>Latitude: ${lat}</p>
                <p>Longitude: ${lng}</p>
                <button onclick="copyCoordinates(${lat}, ${lng})">Copier les coordonnées</button>
                <button onclick="removeEmptyZoneMarker(${index})">Supprimer ce marqueur</button>
            </div>
        `
    });

    marker.addListener('click', () => {
        if (currentInfoWindow) {
            currentInfoWindow.close();
        }
        infowindow.open(map, marker);
        currentInfoWindow = infowindow;
    });

    emptyZoneMarkers.push({
        marker: marker,
        circle: circle,
        infowindow: infowindow
    });
}

function copyCoordinates(lat, lng) {
    const coordText = `${lat}, ${lng}`;
    navigator.clipboard.writeText(coordText).then(() => {
        alert('Coordonnées copiées dans le presse-papiers!');
    }).catch(err => {
        console.error('Erreur lors de la copie:', err);
        alert('Erreur lors de la copie des coordonnées');
    });
}

function toggleDistanceMode() {
    // Désactiver le mode zone vide s'il est actif
    if (isEmptyZoneMode) toggleEmptyZoneMode();

    isDistanceMode = !isDistanceMode;
    const btn = document.getElementById('measureDistanceBtn');
    const modeInfo = document.getElementById('mode-info');

    if (isDistanceMode) {
        btn.classList.add('active');
        modeInfo.innerHTML = '<i class="fas fa-info-circle"></i> Cliquez sur deux points pour mesurer la distance';
        modeInfo.style.display = 'block';
        map.setOptions({draggableCursor: 'crosshair'});

        clickListener = map.addListener('click', handleDistanceClick);
    } else {
        btn.classList.remove('active');
        modeInfo.style.display = 'none';
        map.setOptions({draggableCursor: null});

        clearDistanceMeasure();

        if (clickListener) {
            google.maps.event.removeListener(clickListener);
            clickListener = null;
        }
    }
}

function handleDistanceClick(event) {
    if (distanceMarkers.length < 2) {
        const color = distanceMarkers.length === 0 ? '#1E88E5' : '#D81B60';
        const label = distanceMarkers.length === 0 ? 'A' : 'B';

        const marker = new google.maps.Marker({
            position: event.latLng,
            map: map,
            icon: {
                path: google.maps.SymbolPath.CIRCLE,
                scale: 7,
                fillColor: color,
                fillOpacity: 1,
                strokeColor: 'white',
                strokeWeight: 2
            },
            label: {
                text: label,
                color: 'white',
                fontSize: '12px'
            }
        });

        distanceMarkers.push(marker);

        if (distanceMarkers.length === 2) {
            drawDistanceLine();
        }
    }
}

function drawDistanceLine() {
    const path = distanceMarkers.map(marker => marker.getPosition());

    if (distanceLine) {
        distanceLine.setPath(path);
    } else {
        distanceLine = new google.maps.Polyline({
            path: path,
            geodesic: true,
            strokeColor: '#FF4081',
            strokeOpacity: 1.0,
            strokeWeight: 2,
            map: map
        });
    }

    const distance = google.maps.geometry.spherical.computeDistanceBetween(
        path[0],
        path[1]
    );

    const midPoint = new google.maps.LatLng(
        (path[0].lat() + path[1].lat()) / 2,
        (path[0].lng() + path[1].lng()) / 2
    );

    if (distanceInfoWindow) {
        distanceInfoWindow.close();
    }

    distanceInfoWindow = new google.maps.InfoWindow({
        position: midPoint,
        content: `<div style="text-align: center;">
            <strong>Distance:</strong> ${formatDistance(distance)}<br>
            <button onclick="clearDistanceMeasure()">Effacer</button>
        </div>`
    });

    distanceInfoWindow.open(map);
}

function formatDistance(meters) {
    if (meters < 1000) {
        return `${Math.round(meters)} mètres`;
    } else {
        return `${(meters / 1000).toFixed(2)} km`;
    }
}

function clearDistanceMeasure() {
    distanceMarkers.forEach(marker => marker.setMap(null));
    distanceMarkers = [];

    if (distanceLine) {
        distanceLine.setMap(null);
        distanceLine = null;
    }

    if (distanceInfoWindow) {
        distanceInfoWindow.close();
        distanceInfoWindow = null;
    }
}

function getSearchPoints(bounds) {
    const ne = bounds.getNorthEast();
    const sw = bounds.getSouthWest();
    return [
        bounds.getCenter(),
        new google.maps.LatLng(ne.lat(), ne.lng()),
        new google.maps.LatLng(ne.lat(), sw.lng()),
        new google.maps.LatLng(sw.lat(), ne.lng()),
        new google.maps.LatLng(sw.lat(), sw.lng())
    ];
}

function isPharmacyExists(location) {
    return markers.some(marker =>
        marker.getPosition().equals(location));
}

function updateStats() {
    document.getElementById('stats').innerHTML =
        `<strong>${totalResults}</strong> pharmacies trouvées au total`;
}

function removeEmptyZoneMarker(index) {
    if (emptyZoneMarkers[index]) {
        emptyZoneMarkers[index].marker.setMap(null);
        emptyZoneMarkers[index].circle.setMap(null);
        emptyZoneMarkers[index].infowindow.close();
        emptyZoneMarkers.splice(index, 1);
    }
}

function createMarkerWithDetails(place) {
    const service = new google.maps.places.PlacesService(map);

    service.getDetails({
        placeId: place.place_id,
        fields: ['name', 'formatted_address', 'formatted_phone_number', 'opening_hours']
    }, (details, status) => {
        if (status === google.maps.places.PlacesServiceStatus.OK) {
            const marker = new google.maps.Marker({
                map: map,
                position: place.geometry.location,
                title: place.name,
                animation: google.maps.Animation.DROP
            });

            const circle = new google.maps.Circle({
                map: map,
                center: place.geometry.location,
                radius: 300,
                fillColor: '#FF0000',
                fillOpacity: 0.15,
                strokeColor: '#FF0000',
                strokeWeight: 1 ,
                 clickable: false
            });

            const isOpen = details.opening_hours ?
                (details.opening_hours.isOpen() ? 'open' : 'closed') : '';

            const contentString = `
                <div class="pharmacy-info">
                    <h3>${details.name}</h3>
                    <p>${details.formatted_address || 'Adresse non disponible'}</p>
                    <p><strong>Tél:</strong> ${details.formatted_phone_number || 'Non disponible'}</p>
                    ${isOpen ? `<div class="status ${isOpen}">
                        ${isOpen === 'open' ? 'Ouvert' : 'Fermé'}
                    </div>` : ''}
                </div>
            `;

            const infowindow = new google.maps.InfoWindow({
                content: contentString
            });

            marker.addListener('click', () => {
                if (currentInfoWindow) {
                    currentInfoWindow.close();
                }
                infowindow.open(map, marker);
                currentInfoWindow = infowindow;
            });

            markers.push(marker);
            circles.push(circle);
        }
    });
}

function clearMap() {
    if (confirm('Voulez-vous vraiment effacer tous les marqueurs de la carte ?')) {
        markers.forEach(marker => marker.setMap(null));
        circles.forEach(circle => circle.setMap(null));

        emptyZoneMarkers.forEach(item => {
            item.marker.setMap(null);
            item.circle.setMap(null);
            item.infowindow.close();
        });

        clearDistanceMeasure();

        markers = [];
        circles = [];
        emptyZoneMarkers = [];

        if (currentInfoWindow) {
            currentInfoWindow.close();
        }
        totalResults = 0;
        document.getElementById('stats').innerHTML = '';

        if (isDistanceMode) toggleDistanceMode();
        if (isEmptyZoneMode) toggleEmptyZoneMode();
    }
}