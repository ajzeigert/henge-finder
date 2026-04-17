const maplibregl = window.maplibregl;
const SunCalc = window.SunCalc;
const turf = window.turf;

// prior art https://suncalc.net/

// initial point
const stoneHenge = new maplibregl.LngLat(-1.825819, 51.179203);
const version = "0.5.4";

// initial state
const state = {
	date: new Date(),
	lngLat: stoneHenge,
	elevation: 2,
	bearingLength: 30,
	bearingPixelRadius: 160,
	sunriseBearing: null,
	sunsetBearing: null,
	sunsetMaxBearing: null,
	sunsetMinBearing: null,
	sunriseMaxBearing: null,
	sunriseMinBearing: null,
};

SunCalc.getDateForAzimuth = (
	targetBearing,
	lat,
	lng,
	type = "sunrise",
	referenceDate = new Date(),
) => {
	const phi = (lat * Math.PI) / 180;
	const A = (targetBearing * Math.PI) / 180;

	// At horizon: cos(A) = sin(δ) / cos(φ), so solve for declination)
	const sinDec = Math.cos(phi) * Math.cos(A);
	if (Math.abs(sinDec) > 1) return null; // azimuth unreachable at this latitude
	const decDeg = (Math.asin(sinDec) * 180) / Math.PI;

	// Invert approximate declination formula: δ ≈ -23.45° × cos(2π(d+10)/365)
	const cosArg = Math.max(-1, Math.min(1, -decDeg / 23.45));
	if (Math.abs(cosArg) > 1) return null;
	const theta = Math.acos(cosArg);
	const d1 = (365 * theta) / (2 * Math.PI) - 10; // ascending toward summer
	const d2 = 355 - (365 * theta) / (2 * Math.PI); //descending toward winter

	const now = new Date();
	const year = now.getFullYear();

	function bearingForDOY(doy) {
		const date = new Date(year, 0, doy);
		const times = SunCalc.getTimes(date, lat, lng);
		const eventTime = type === "sunrise" ? times.sunrise : times.sunset;
		const pos = SunCalc.getPosition(eventTime, lat, lng);
		return ((pos.azimuth * 180) / Math.PI + 180) % 360;
	}

	function refine(d) {
		const f0 = bearingForDOY(d) - targetBearing;
		const f1 = bearingForDOY(d + 1) - targetBearing;
		const slope = f1 - f0;
		if (Math.abs(slope) < 0.1) return d; // near solstice, barely changing
		const step = f0 / slope;
		if (Math.abs(step) > 15) return d;
		return d - step;
	}

	const r1 = refine(d1);
	const r2 = refine(d2);

	// Return nearest to reference date
	const refDOY = (referenceDate - new Date(year, 0, 1)) / 86400000;
	const dist1 = Math.min(Math.abs(r1 - refDOY), 365 - Math.abs(r1 - refDOY));
	const dist2 = Math.min(Math.abs(r2 - refDOY), 365 - Math.abs(r2 - refDOY));
	const bestDOY = dist1 < dist2 ? r1 : r2;
	return new Date(year, 0, Math.round(bestDOY));
};

// Meeus algorithm

function jdeToDate(jde) {
	return new Date((jde - 2440587.5) * 86400000);
}

function getSolstice(year, type) {
	const Y = (year - 2000) / 1000;
	let jde;

	if (type === "summer") {
		jde =
			2451716.56767 +
			365241.62603 * Y +
			0.00325 * Y ** 2 +
			0.07257 * Y ** 3 -
			0.05823 * Y ** 4 -
			0.01119 * Y ** 5;
	} else {
		jde =
			2451900.05952 +
			365242.74049 * Y -
			0.06223 * Y ** 2 -
			0.00823 * Y ** 3 +
			0.00032 * Y ** 4;
	}

	return jdeToDate(jde);
}

const headerContainer = document.getElementById("henge-header");
headerContainer.className = "season-slider";

const header = document.createElement("h3");
header.innerText = "Henge Finder";
// header.className = "space-grotesk-500";

const labels = document.createElement("div");
labels.className = "season-slider-labels";
labels.innerHTML =
	"<span>Winter</span><span>Spring</span><span>Summer</span><span>Autumn</span><span>Winter</span>";

const slider = document.createElement("input");
slider.type = "range";
slider.className = "season-range";
slider.min = 0;
slider.max = 365;
slider.value = dateToSlider(new Date());
slider.setAttribute("list", "season-list");

const dataList = document.createElement("datalist");
dataList.id = "season-list";

[0, 91, 182, 273, 365].forEach((v) => {
	const dataListOption = document.createElement("option");
	dataListOption.value = v;
	dataList.append(dataListOption);
});

const dateInput = document.createElement("input");
dateInput.type = "date";
dateInput.className = "season-date";
dateInput.value = new Date().toISOString().split("T")[0];

slider.addEventListener("input", (e) => {
	state.date = sliderToDate(parseInt(e.target.value, 10));
	setDate(state.date);
	render();
});

const dateContainer = document.createElement("div");
dateContainer.className = "date-container";

dateInput.addEventListener("input", (e) => {
	setDate(new Date(`${e.target.value}T12:00:00`));
	render();
});

const nowButton = document.createElement("button");
nowButton.innerText = "Now";

nowButton.addEventListener("click", () => {
	const date = new Date();
	setDate(date);
	render();
});

dateContainer.append(dateInput, nowButton);

const resetMarkerButton = document.createElement("button");
resetMarkerButton.innerText = "Re-Center Marker";
resetMarkerButton.type = "button";

resetMarkerButton.addEventListener("click", () => {
	state.lngLat = map.getCenter();
	render();
});

const versionEl = document.createElement("small");
versionEl.innerHTML = `Version ${version} | © 2026 <a href='https://mastodon.social/@zeigert'>@zeigert</a>`;

headerContainer.append(
	header,
	labels,
	slider,
	dataList,
	dateContainer,
	resetMarkerButton,
	versionEl,
);

function setDate(incomingDate) {
	if (!incomingDate) return;
	state.date = incomingDate;
	slider.value = dateToSlider(incomingDate);
	dateInput.value = incomingDate.toISOString().split("T")[0];
}

function dateToSlider(date) {
	const year = date.getFullYear();
	let winterSolstice = new Date(year, 11, 21);
	let days = Math.round((date - winterSolstice) / 86400000);
	if (days < 0) {
		winterSolstice = new Date(year - 1, 11, 21);
		days = Math.round((date - winterSolstice) / 86400000);
	}
	return Math.min(days, 365);
}
function sliderToDate(days) {
	const now = new Date();
	const year = now.getFullYear();
	const thisYearSolstice = new Date(year, 11, 21);
	const base =
		thisYearSolstice > now ? new Date(year - 1, 11, 21) : thisYearSolstice;
	return new Date(base.getTime() + days * 86400000);
}

const map = new maplibregl.Map({
	container: "map",
	// style: "https://tiles.openfreemap.org/styles/positron",
	center: stoneHenge,
	zoom: 15,
	hash: true,
	attributionControl: {
		customAttribution: `Share photo: <a href="https://commons.wikimedia.org/wiki/File:Stonehenge84.jpg">Salix alba at en.wikipedia</a>, <a href="http://creativecommons.org/licenses/by-sa/3.0/">CC BY-SA 3.0</a>`,
	},
});

map.setStyle("https://tiles.openfreemap.org/styles/bright", {
	transformStyle: (prevStyle, nextStyle) => {
		nextStyle.sources = {
			...nextStyle.sources,
			satelliteSource: {
				type: "raster",
				tiles: [
					// "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/{z}/{y}/{x}.jpg",
					"https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
				],
				tileSize: 256,
				attribution: "Esri, Maxar, Earthstar Geographics",
			},
		};

		const lastFillLayer = nextStyle.layers.findLast(
			(layer) => layer.type === "fill",
		);
		nextStyle.layers.splice(nextStyle.layers.indexOf(lastFillLayer), 0, {
			id: "satellite",
			type: "raster",
			source: "satelliteSource",
			layout: { visibility: "visible" },
			paint: { "raster-opacity": 1 },
		});
		return nextStyle;
	},
});

function bearingToLngLat(bearing) {
	const centerPx = map.project(state.lngLat);
	const rad = (bearing * Math.PI) / 180;
	return map
		.unproject({
			x: centerPx.x + state.bearingPixelRadius * Math.sin(rad),
			y: centerPx.y - state.bearingPixelRadius * Math.cos(rad),
		})
		.toArray();
}

function getBearing({ time, center }) {
	const position = SunCalc.getPosition(time, center.lat, center.lng);
	return ((position.azimuth * 180) / Math.PI + 180) % 360;
}
function getBearingLine({ time, center, properties = {} }) {
	const bearing = getBearing({ time, center });
	const endCoords = bearingToLngLat(bearing);
	const azimuthLine = turf.lineString(
		[center.toArray(), endCoords],
		properties,
	);
	const horizonPoint = turf.point(endCoords, properties);
	return { bearing, horizonPoint, azimuthLine };
}

function getOverlayGeometry({
	date = new Date(),
	center = { lat: 0, lng: 0 },
	elevation = 0.1,
}) {
	if (!date) return;
	const times = SunCalc.getTimes(date, center.lat, center.lng, elevation);
	const summerSolsticeTimes = SunCalc.getTimes(
		getSolstice(date.getFullYear(), "summer"),
		center.lat,
		center.lng,
		elevation,
	);
	const winterSolsticeTimes = SunCalc.getTimes(
		getSolstice(date.getFullYear(), "winter"),
		center.lat,
		center.lng,
		elevation,
	);

	const {
		azimuthLine: sunriseAzimuthLine,
		bearing: sunriseBearing,
		horizonPoint: sunrisePoint,
	} = getBearingLine({
		time: times.sunrise,
		center,
		properties: { type: "sunrise" },
	});
	const {
		azimuthLine: sunsetAzimuthLine,
		bearing: sunsetBearing,
		horizonPoint: sunsetPoint,
	} = getBearingLine({
		time: times.sunset,
		center,
		properties: { type: "sunset" },
	});
	const { bearing: sunsetMaxBearing } = getBearingLine({
		time: summerSolsticeTimes.sunset,
		center,
		properties: { type: "maxSunset" },
	});
	const { bearing: sunsetMinBearing } = getBearingLine({
		time: winterSolsticeTimes.sunset,
		center,
		properties: { type: "minSunset" },
	});
	const { bearing: sunriseMaxBearing } = getBearingLine({
		time: summerSolsticeTimes.sunrise,
		center,
		properties: { type: "maxSunset" },
	});
	const { bearing: sunriseMinBearing } = getBearingLine({
		time: winterSolsticeTimes.sunrise,
		center,
		properties: { type: "minSunset" },
	});

	function horizonRadius(elevationMeters) {
		const R = 6371000; // meters
		return Math.sqrt(2 * R * elevationMeters) / 1000; //kim
	}
	const c = turf.point(center.toArray(), { type: "center" });

	const horizonCircle = turf.circle(c, horizonRadius(2), {
		units: "kilometers",
		steps: 64,
		properties: {
			type: "horizon",
		},
	});

	function screenArc(bearing1, bearing2, steps = 64) {
		const coords = [];
		const step = (bearing2 - bearing1) / steps;
		for (let i = 0; i <= steps; i++) {
			coords.push(bearingToLngLat(bearing1 + i * step));
		}
		return coords;
	}

	const sunsetArcCoords = screenArc(sunsetMaxBearing, sunsetMinBearing);

	const sunsetRangePolygon = turf.polygon(
		[[center.toArray(), ...sunsetArcCoords, center.toArray()]],
		{
			type: "sunsetRange",
			maxBearing: sunsetMaxBearing,
			minBearing: sunsetMinBearing,
		},
	);

	const sunriseArcCoords = screenArc(sunriseMaxBearing, sunriseMinBearing);
	const sunriseRangePolygon = turf.polygon(
		[[center.toArray(), ...sunriseArcCoords, center.toArray()]],
		{
			type: "sunriseRange",
			maxBearing: sunriseMaxBearing,
			minBearing: sunriseMinBearing,
		},
	);

	const geojson = turf.featureCollection([
		c,
		sunriseAzimuthLine,
		sunsetAzimuthLine,
		horizonCircle,
		sunrisePoint,
		sunsetPoint,
		sunsetRangePolygon,
		sunriseRangePolygon,
	]);

	return {
		geojson,
		sunriseBearing,
		sunsetBearing,
		sunriseMinBearing,
		sunriseMaxBearing,
		sunsetMinBearing,
		sunsetMaxBearing,
	};
}

map.addControl(
	new maplibregl.NavigationControl({
		visualizePitch: true,
		showZoom: true,
		showCompass: true,
	}),
);

const canvas = map.getCanvasContainer();

function onMove(e, feature) {
	canvas.style.cursor = "grabbing";
	const type = feature.properties.type;
	if (type === "sunset" || type === "sunrise") {
		onAzimuthDragEnd(e, type);
	} else if (type === "center") {
		state.lngLat = e.lngLat;
		render();
	}
}

function onUp() {
	canvas.style.cursor = "";
}

map.on("load", () => {
	map.addSource("solar-features", {
		type: "geojson",
		data: {},
	});
	map.addLayer({
		id: "sun-lines",
		type: "line",
		source: "solar-features",
		paint: { "line-color": "#ff6600", "line-width": 2 },
	});
	map.addLayer({
		id: "azimuth-points",
		type: "circle",
		source: "solar-features",
		filter: [
			"all",
			["in", ["get", "type"], ["literal", ["sunrise", "sunset", "center"]]],
			["==", ["geometry-type"], "Point"],
		],
		paint: {
			"circle-radius": 10,
			"circle-color": "#ff6600",
		},
	});

	map.on("mouseenter", "azimuth-points", () => {
		map.setPaintProperty("azimuth-points", "circle-color", "#ff5500");
		canvas.style.cursor = "move";
	});

	map.on("mouseleave", "azimuth-points", () => {
		map.setPaintProperty("azimuth-points", "circle-color", "#ff6600");
		canvas.style.cursor = "";
	});

	const pointHandler = (e) => {
		e.preventDefault();
		const features = map.queryRenderedFeatures(e.point, {
			layers: ["azimuth-points"],
		});
		if (!features.length) return;

		const feature = features[0];

		const handleMove = (e) => {
			return onMove(e, feature);
		};

		canvas.style.cursor = "grab";
		map.on("mousemove", handleMove);
		map.once("mouseup", () => {
			map.off("mousemove", handleMove);
			onUp();
		});
		map.on("touchmove", handleMove);
		map.once("touchend", () => {
			map.off("touchmove", handleMove);
			onUp();
		});
	};

	map.on("mousedown", "azimuth-points", pointHandler);

	map.on("touchstart", "azimuth-points", (e) => {
		if (e.points.length !== 1) return;
		pointHandler(e);
	});

	render();
});

// event handler for points
function onAzimuthDrag(marker, type) {
	const bearing = turf.bearing(state.lngLat.toArray(), marker.lngLat.toArray());

	const clampedBearing = clampBearing(
		bearing,
		state[`${type}MinBearing`],
		state[`${type}MaxBearing`],
	);

	state[`${type}Bearing`] = clampedBearing;

	// positionMarkerAtBearing(marker, clampedBearing, state.bearingPixelRadius);
	return { clampedBearing };
}

function onAzimuthDragEnd(marker, type) {
	const { clampedBearing } = onAzimuthDrag(marker, type);
	state.date = SunCalc.getDateForAzimuth(
		clampedBearing,
		state.lngLat.lat,
		state.lngLat.lng,
		type,
		state.date,
	);
	setDate(state.date);
	render();
}

function clampBearing(bearing, a, b) {
	bearing = ((bearing % 360) + 360) % 360; // normalize
	const lo = Math.min(a, b);
	const hi = Math.max(a, b);
	if (bearing >= lo && bearing <= hi) return bearing;

	const distToMin = Math.min(
		Math.abs(bearing - lo),
		360 - Math.abs(bearing - lo),
	);
	const distToMax = Math.min(
		Math.abs(bearing - hi),
		360 - Math.abs(bearing - hi),
	);
	return distToMin < distToMax ? lo : hi;
}

map.on("move", () => {
	render();
});

function render() {
	const { date, lngLat, elevation } = state;
	if (!date) return;
	const { geojson, sunriseBearing, sunsetBearing, ...bearings } =
		getOverlayGeometry({
			date,
			center: lngLat,
			elevation,
		});

	Object.assign(state, { sunriseBearing, sunsetBearing, ...bearings });

	map.getSource("solar-features").setData(geojson);
}

// map.addControl(
// 	new maplibregl.TerrainControl({
// 		source: "terrainSource",
// 		exaggeration: 1,
// 	}),
// );
