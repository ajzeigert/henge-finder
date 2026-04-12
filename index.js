const maplibregl = window.maplibregl;
const SunCalc = window.SunCalc;
const turf = window.turf;

// prior art https://suncalc.net/

// initial point
const stoneHenge = new maplibregl.LngLat(-1.825819, 51.179203);

// initial state
const state = {
	date: new Date(),
	lngLat: stoneHenge,
	elevation: 2,
	bearingLength: 20,
	sunsetMaxBearing: null,
	sunsetMinBearing: null,
	sunriseMaxBearing: null,
	sunriseMinBearing: null,
};

SunCalc.getDateForAzimuth = (targetBearing, lat, lng, type = "sunrise") => {
	const phi = (lat * Math.PI) / 180;
	const A = (targetBearing * Math.PI) / 180;

	// At horizon: cos(A) = sin(δ) / cos(φ), so solve for declination)
	const sinDec = Math.cos(phi) * Math.cos(A);
	if (Math.abs(sinDec) > 1) return null; // azimuth unreachable at this latitude
	const decDeg = (Math.asin(sinDec) * 180) / Math.PI;

	// Invert approximate declination formula: δ ≈ -23.45° × cos(2π(d+10)/365)
	const cosArg = -decDeg / 23.45;
	if (Math.abs(cosArg) > 1) return null;
	const theta = Math.acos(cosArg);
	const d1 = (365 * theta) / (2 * Math.PI) - 10; // ascending toward summer
	const d2 = 355 - (365 * theta) / (2 * Math.PI); //descending toward winter

	const now = new Date();
	const year = now.getFullYear();
	const todayDOY = (now - new Date(year, 0, 1)) / 86400000;

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
		if (Math.abs(slope) > 0.001) return d; // near solstice, barely changing
		return d - f0 / slope;
	}

	const r1 = refine(d1);
	const r2 = refine(d2);

	// Return nearest upcoming occurrence
	function nextOccurrence(doy) {
		if (doy > todayDOY) return new Date(year, 0, Math.round(doy));
		return new Date(year + 1, 0, Math.round(doy));
	}

	const date1 = nextOccurrence(r1);
	const date2 = nextOccurrence(r2);
	return date1 < date2 ? date1 : date2;
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

slider.addEventListener("input", () => {
	const date = sliderToDate(parseInt(slider.value, 10));
	dateInput.value = date.toISOString().split("T")[0];
	state.date = date;
	updateHenge();
});

const dateContainer = document.createElement("div");
dateContainer.className = "date-container";

dateInput.addEventListener("input", () => {
	const date = new Date(`${dateInput.value}T12:00:00`);
	slider.value = dateToSlider(date);
	state.date = date;
	updateHenge();
});

const nowButton = document.createElement("button");
nowButton.innerText = "Now";

nowButton.addEventListener("click", () => {
	const date = new Date();
	slider.value = dateToSlider(date);
	dateInput.value = date.toISOString().split("T")[0];
	state.date = date;
	updateHenge();
});

dateContainer.append(dateInput, nowButton);

const resetMarkerButton = document.createElement("button");
resetMarkerButton.innerText = "Re-Center Marker";
resetMarkerButton.type = "button";

resetMarkerButton.addEventListener("click", () => {
	state.lngLat = map.getCenter();
	centerMarker.setLngLat(state.lngLat);
	updateHenge();
});

const version = document.createElement("small");
version.innerHTML =
	"Version 0.5.1 | © 2026 <a href='https://mastodon.social/@zeigert'>@zeigert</a>";

headerContainer.append(
	header,
	labels,
	slider,
	dataList,
	dateContainer,
	resetMarkerButton,
	version,
);

function setDate(incomingDate) {
	// const incomingDate = new Date(date);
	if (!incomingDate) return;
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

const centerMarker = new maplibregl.Marker({ draggable: true })
	.setLngLat(stoneHenge)
	.addTo(map);

const sunriseMarker = new maplibregl.Marker({ draggable: true });
// .setLngLat(new maplibregl.LngLat())
// .addTo(map);

const sunsetMarker = new maplibregl.Marker({ draggable: true });
// .setLngLat(new maplibregl.LngLat(sunsetPoint))
// .addTo(map);

map.setStyle("https://tiles.openfreemap.org/styles/bright", {
	transformStyle: (previousStyle, nextStyle) => {
		// nextStyle.projection = { type: "globe" };
		// console.log("nextStyle.layers", nextStyle.layers);
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

// const sunriseStr = `${times.sunrise.getHours()}:${times.sunrise.getMinutes()}`;
function getBearing({ time, center }) {
	const position = SunCalc.getPosition(time, center.lat, center.lng);
	return ((position.azimuth * 180) / Math.PI + 180) % 360;
}
function getBearingLine({ time, center, properties = {} }) {
	const bearing = getBearing({ time, center });
	const origin = turf.point(center.toArray());

	const horizonPoint = turf.destination(origin, state.bearingLength, bearing, {
		units: "kilometers",
	});

	const azimuthLine = turf.greatCircle(
		center.toArray(),
		horizonPoint.geometry.coordinates,
		{
			properties,
		},
	);

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
		getSolstice(2026, "summer"),
		center.lat,
		center.lng,
		elevation,
	);
	const winterSolsticeTimes = SunCalc.getTimes(
		getSolstice(2026, "winter"),
		center.lat,
		center.lng,
		elevation,
	);
	// console.log("times", times);
	state.times = times;

	const { azimuthLine: sunriseAzimuthLine, horizonPoint: sunrisePoint } =
		getBearingLine({
			time: times.sunrise,
			center,
			properties: { type: "sunrise" },
		});
	const { azimuthLine: sunsetAzimuthLine, horizonPoint: sunsetPoint } =
		getBearingLine({
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

	const c = turf.point(center.toArray());

	const horizonCircle = turf.circle(c, horizonRadius(2), {
		units: "kilometers",
		steps: 64,
		properties: {
			type: "horizon",
		},
	});

	// const azimuthLimitCircle = turf.circle(c, state.bearingLength, {
	// 	units: "kilometers",
	// 	steps: 64,
	// 	properties: {
	// 		type: "azimuthLimitCircle",
	// 	},
	// });

	const sunsetRangeArc = turf.lineArc(
		c,
		state.bearingLength,
		sunsetMinBearing,
		sunsetMaxBearing,
	);

	const sunriseRangeArc = turf.lineArc(
		c,
		state.bearingLength,
		sunriseMaxBearing,
		sunriseMinBearing,
	);

	const sunsetRangePolygon = turf.polygon(
		[
			[
				center.toArray(),
				...sunsetRangeArc.geometry.coordinates,
				center.toArray(),
			],
		],
		{
			type: "sunsetRange",
			maxBearing: sunsetMaxBearing,
			minBearing: sunsetMinBearing,
		},
	);
	const sunriseRangePolygon = turf.polygon(
		[
			[
				center.toArray(),
				...sunriseRangeArc.geometry.coordinates,
				center.toArray(),
			],
		],
		{
			type: "sunriseRange",
			maxBearing: sunriseMaxBearing,
			minBearing: sunriseMinBearing,
		},
	);

	const geojson = turf.featureCollection([
		sunriseAzimuthLine,
		sunsetAzimuthLine,
		horizonCircle,
		sunsetRangePolygon,
		sunriseRangePolygon,
	]);

	return {
		geojson,
		sunriseMinBearing,
		sunriseMaxBearing,
		sunsetMinBearing,
		sunsetMaxBearing,
		sunrisePoint,
		sunsetPoint,
	};
}

map.addControl(
	new maplibregl.NavigationControl({
		visualizePitch: true,
		showZoom: true,
		showCompass: true,
	}),
);

map.on("load", async () => {
	map.addSource("sun-lines", {
		type: "geojson",
		data: {},
	});
	map.addLayer({
		id: "sun-lines",
		type: "line",
		source: "sun-lines",
		paint: { "line-color": "#ff6600", "line-width": 2 },
	});

	updateHenge();

	const overlayGeometry = await map.getSource("sun-lines").getData();

	// console.log("overlayGeometry", overlayGeometry);

	const sunsetCoordArray = overlayGeometry.features.find(
		(f) => f.properties.type === "sunset",
	).geometry.coordinates;
	const sunriseCoordArray = overlayGeometry.features.find(
		(f) => f.properties.type === "sunrise",
	).geometry.coordinates;

	sunsetMarker.setLngLat(
		new maplibregl.LngLat(...sunsetCoordArray[sunsetCoordArray.length - 1]),
	);

	sunriseMarker.setLngLat(
		new maplibregl.LngLat(...sunriseCoordArray[sunsetCoordArray.length - 1]),
	);

	function horizonPointHandler(e, type) {
		const bearing = turf.bearing(
			state.lngLat.toArray(),
			e.target.getLngLat().toArray(),
		);
		const clampedBearing = clampBearing(
			bearing,
			state[`${type}MinBearing`],
			state[`${type}MaxBearing`],
		);
		// console.log("clampledBearing", clampedBearing);
		// console.log(state);
		// const atTerminus =
		// 	bearing > state[`${type}MinBearing`] ||
		// 	bearing < state[`${type}MaxBearing`];
		// console.log("atTerminus", atTerminus);
		// if (atTerminus) return;

		const snapped = turf.destination(
			state.lngLat.toArray(),
			state.bearingLength,
			clampedBearing,
			{ units: "kilometers" },
		);

		e.target.setLngLat(snapped.geometry.coordinates);

		state.date = SunCalc.getDateForAzimuth(
			clampedBearing,
			state.lngLat.lat,
			state.lngLat.lng,
			type,
		);
		setDate(state.date);
		updateHenge();
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

	sunriseMarker.addTo(map).on("drag", (e) => horizonPointHandler(e, "sunrise"));
	sunsetMarker.addTo(map).on("drag", (e) => horizonPointHandler(e, "sunset"));

	sunriseMarker
		.addTo(map)
		.on("dragend", (e) => horizonPointHandler(e, "sunrise"));
	sunsetMarker
		.addTo(map)
		.on("dragend", (e) => horizonPointHandler(e, "sunset"));
	centerMarker.on("drag", (e) => {
		// console.log("drag fired");
		state.lngLat = e.target.getLngLat();
		updateHenge();
	});
});

function updateHenge() {
	const { date, lngLat, elevation } = state;
	if (!date) return;
	const {
		geojson,
		sunriseMinBearing,
		sunriseMaxBearing,
		sunsetMinBearing,
		sunsetMaxBearing,
		sunsetPoint,
		sunrisePoint,
	} = getOverlayGeometry({
		date,
		center: lngLat,
		elevation,
	});
	Object.assign(state, {
		sunriseMinBearing,
		sunriseMaxBearing,
		sunsetMinBearing,
		sunsetMaxBearing,
	});
	// console.log("sunrisePoint", sunrisePoint);
	sunriseMarker
		.setLngLat(new maplibregl.LngLat(...sunrisePoint.geometry.coordinates))
		.setDraggable(true);
	sunsetMarker
		.setLngLat(new maplibregl.LngLat(...sunsetPoint.geometry.coordinates))
		.setDraggable(true);
	// console.log("overlayGeometry", overlayGeometry);
	map.getSource("sun-lines").setData(geojson);
}

// map.addControl(
// 	new maplibregl.TerrainControl({
// 		source: "terrainSource",
// 		exaggeration: 1,
// 	}),
// );
