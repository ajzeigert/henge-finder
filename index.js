const maplibregl = window.maplibregl;
const SunCalc = window.SunCalc;
const turf = window.turf;
// console.log("window", window);

// inspiration ish? https://suncalc.net/

// let center = [-1.826111, 51.178889];
const stoneHenge = new maplibregl.LngLat(-1.825819, 51.179203);

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

const state = {
	date: new Date(),
	lngLat: stoneHenge,
	elevation: 2,
	bearingLength: 50,
};

class SeasonControl {
	constructor(onChange, marker) {
		this._onChange = onChange;
		this._marker = marker;
	}
	onAdd(map) {
		this._map = map;
		this._container = document.createElement("div");
		this._container.className = "maplibregl-ctrl season-slider";

		const header = document.createElement("h3");
		header.innerText = "Henge Finder";

		const labels = document.createElement("div");
		labels.className = "season-slider-labels";
		labels.innerHTML =
			"<span>Winter</span><span>Spring</span><span>Summer</span><span>Autumn</span><span>Winter</span>";

		const slider = document.createElement("input");
		slider.type = "range";
		slider.className = "season-range";
		slider.min = 0;
		slider.max = 365;
		slider.value = this._dateToSlider(new Date());
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
			const date = this._sliderToDate(parseInt(slider.value, 10));
			dateInput.value = date.toISOString().split("T")[0];
			this._onChange(date);
		});

		const dateContainer = document.createElement("div");
		dateContainer.className = "date-container";

		dateInput.addEventListener("input", () => {
			const date = new Date(`${dateInput.value}T12:00:00`);
			slider.value = this._dateToSlider(date);
			this._onChange(date);
		});

		const nowButton = document.createElement("button");
		nowButton.innerText = "Now";

		nowButton.addEventListener("click", () => {
			const date = new Date();
			slider.value = this._dateToSlider(date);
			dateInput.value = date.toISOString().split("T")[0];
			this._onChange(date);
		});

		dateContainer.append(dateInput, nowButton);

		const resetMarkerButton = document.createElement("button");
		resetMarkerButton.innerText = "Re-Center Marker";
		resetMarkerButton.type = "button";

		resetMarkerButton.addEventListener("click", () => {
			state.lngLat = this._map.getCenter();
			this._marker.setLngLat(state.lngLat);
			updateHenge();
		});

		this._container.append(
			header,
			labels,
			slider,
			dataList,
			dateContainer,
			resetMarkerButton,
		);

		return this._container;
	}
	onRemove() {
		this._container.remove();
		this._map = undefined;
	}
	_dateToSlider(date) {
		const year = date.getFullYear();
		let winterSolstice = new Date(year, 11, 21);
		let days = Math.round((date - winterSolstice) / 86400000);
		if (days < 0) {
			winterSolstice = new Date(year - 1, 11, 21);
			days = Math.round((date - winterSolstice) / 86400000);
		}
		return Math.min(days, 365);
	}
	_sliderToDate(days) {
		const now = new Date();
		const year = now.getFullYear();
		const thisYearSolstice = new Date(year, 11, 21);
		const base =
			thisYearSolstice > now ? new Date(year - 1, 11, 21) : thisYearSolstice;
		return new Date(base.getTime() + days * 86400000);
	}
}

const map = new maplibregl.Map({
	container: "map",
	// style: "https://tiles.openfreemap.org/styles/positron",
	center: stoneHenge,
	zoom: 15,
	hash: true,
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

map.addControl(
	new SeasonControl((date) => {
		state.date = date;
		updateHenge();
	}, centerMarker),
	"top-left",
);

// esri world imagery
//
// {
//   type: 'raster',
//   tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/til
// e/{z}/{y}/{x}'],
//   tileSize: 256,
//   attribution: 'Esri, Maxar, Earthstar Geographics'
// }

map.setStyle("https://tiles.openfreemap.org/styles/bright", {
	transformStyle: (previousStyle, nextStyle) => {
		// nextStyle.projection = { type: "globe" };
		console.log("nextStyle.layers", nextStyle.layers);
		nextStyle.sources = {
			...nextStyle.sources,
			satelliteSource: {
				type: "raster",
				tiles: [
					// "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/{z}/{y}/{x}.jpg",
					"https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
				],
				tileSize: 256,
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

function getBearingLine({ time, center, properties = {} }) {
	const position = SunCalc.getPosition(time, center.lat, center.lng);

	const bearing = ((position.azimuth * 180) / Math.PI + 180) % 360;

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
	const { azimuthLine: sunsetMaxAzimuthLine, bearing: sunsetMaxBearing } =
		getBearingLine({
			time: summerSolsticeTimes.sunset,
			center,
			properties: { type: "maxSunset" },
		});
	const { azimuthLine: sunsetMinAzimuthLine, bearing: sunsetMinBearing } =
		getBearingLine({
			time: winterSolsticeTimes.sunset,
			center,
			properties: { type: "minSunset" },
		});
	const { azimuthLine: sunriseMaxAzimuthLine, bearing: sunriseMaxBearing } =
		getBearingLine({
			time: summerSolsticeTimes.sunrise,
			center,
			properties: { type: "maxSunset" },
		});
	const { azimuthLine: sunriseMinAzimuthLine, bearing: sunriseMinBearing } =
		getBearingLine({
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

	const azimuthLimitCircle = turf.circle(c, state.bearingLength, {
		units: "kilometers",
		steps: 64,
		properties: {
			type: "azimuthLimitCircle",
		},
	});

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
		{ type: "sunsetRange" },
	);
	const sunriseRangePolygon = turf.polygon(
		[
			[
				center.toArray(),
				...sunriseRangeArc.geometry.coordinates,
				center.toArray(),
			],
		],
		{ type: "sunriseRange" },
	);

	return turf.featureCollection([
		sunriseAzimuthLine,
		sunsetAzimuthLine,
		horizonCircle,
		sunsetRangePolygon,
		sunriseRangePolygon,
		// azimuthLimitCircle,
		// sunsetMaxAzimuthLine,
		// sunsetMinAzimuthLine,
		// sunriseMaxAzimuthLine,
		// sunriseMinAzimuthLine,
		// sunsetRangeArc,
		// sunriseRangeArc,
	]);
}
// map.on("moveend", (e) => {
// 	console.log("movend event", e);
// 	console.log(map.getCenter());
// 	marker.setLngLat(map.getCenter());
// });

// const map = new maplibregl.Map({
// 	container: "map",
// 	zoom: 12,
// 	center: [11.39085, 47.27574],
// 	pitch: 70,
// 	hash: true,
// 	style: {
// 		version: 8,
// 		sources: {
// 			osm: {
// 				type: "raster",
// 				tiles: ["https://a.tile.openstreetmap.org/{z}/{x}/{y}.png"],
// 				tileSize: 256,
// 				attribution: "&copy; OpenStreetMap Contributors",
// 				maxzoom: 19,
// 			},
// 			// Use a different source for terrain and hillshade layers, to improve render quality
// 			terrainSource: {
// 				type: "raster-dem",
// 				url: "https://demotiles.maplibre.org/terrain-tiles/tiles.json",
// 				tileSize: 256,
// 			},
// 			hillshadeSource: {
// 				type: "raster-dem",
// 				url: "https://demotiles.maplibre.org/terrain-tiles/tiles.json",
// 				tileSize: 256,
// 			},
// 		},
// 		layers: [
// 			{
// 				id: "osm",
// 				type: "raster",
// 				source: "osm",
// 			},
// 			{
// 				id: "hills",
// 				type: "hillshade",
// 				source: "hillshadeSource",
// 				layout: { visibility: "visible" },
// 				paint: { "hillshade-shadow-color": "#473B24" },
// 			},
// 		],
// 		terrain: {
// 			source: "terrainSource",
// 			exaggeration: 1,
// 		},
// 		sky: {},
// 	},
// 	maxZoom: 18,
// 	maxPitch: 85,
// });

map.addControl(
	new maplibregl.NavigationControl({
		visualizePitch: true,
		showZoom: true,
		showCompass: true,
	}),
);

map.on("load", () => {
	map.addSource("sun-lines", {
		type: "geojson",
		data: {},
		// data: getBearingLines({
		// 	date: new Date(),
		// 	center: marker.getLngLat(),
		// 	elevation,
		// }),
	});
	map.addLayer({
		id: "sun-lines",
		type: "line",
		source: "sun-lines",
		paint: { "line-color": "#ff6600", "line-width": 2 },
	});

	centerMarker.on("drag", (e) => {
		// console.log("drag fired");
		state.lngLat = e.target.getLngLat();
		updateHenge();
	});
	updateHenge();
});

function updateHenge() {
	const { date, lngLat, elevation } = state;
	map.getSource("sun-lines").setData(
		getOverlayGeometry({
			date,
			center: lngLat,
			elevation,
		}),
	);
}

// map.addControl(
// 	new maplibregl.TerrainControl({
// 		source: "terrainSource",
// 		exaggeration: 1,
// 	}),
// );
