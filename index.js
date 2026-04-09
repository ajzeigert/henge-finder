const maplibregl = window.maplibregl;
const SunCalc = window.SunCalc;
const turf = window.turf;

// inspiration ish? https://suncalc.net/

// let center = [-1.826111, 51.178889];
const stoneHenge = new maplibregl.LngLat(-1.826111, 51.178889);

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
		this._container.className =
			"maplibregl-ctrl maplibregl-ctrl-group season-slider";

		const header = document.createElement("h3");
		header.innerText = "Henge Finder";

		const labels = document.createElement("div");
		labels.className = "season-slider-labels";
		labels.innerHTML =
			"<span>Winter</span><span>Equinox</span><span>Summer</span>";

		const slider = document.createElement("input");
		slider.type = "range";
		slider.className = "season-range";
		slider.min = 0;
		slider.max = 182;
		slider.value = this._dateToSlider(new Date());
		slider.setAttribute("list", "season-list");

		const dataList = document.createElement("datalist");
		dataList.id = "season-list";

		const dataListOption1 = document.createElement("option");
		dataListOption1.value = 91;
		const dataListOption2 = document.createElement("option");
		dataListOption2.value = 0;
		const dataListOption3 = document.createElement("option");
		dataListOption3.value = 182;

		dataList.append(dataListOption1, dataListOption2, dataListOption3);

		const dateInput = document.createElement("input");
		dateInput.type = "date";
		dateInput.className = "season-date";
		dateInput.value = new Date().toISOString().split("T")[0];

		slider.addEventListener("input", () => {
			const date = this._sliderToDate(parseInt(slider.value, 10));
			dateInput.value = date.toISOString().split("T")[0];
			this._onChange(date);
		});

		dateInput.addEventListener("input", () => {
			const date = new Date(`${dateInput.value}T12:00:00`);
			slider.value = this._dateToSlider(date);
			this._onChange(date);
		});

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
			dateInput,
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
		const winterSolstice = new Date(year, 11, 21);
		let days = Math.round((date - winterSolstice) / 86400000);
		if (days < 0) days += 365;
		return Math.min(days, 182);
	}
	_sliderToDate(days) {
		const winterSolstice = new Date(new Date().getFullYear(), 11, 21);
		return new Date(winterSolstice.getTime() + days * 86400000);
	}
}

const map = new maplibregl.Map({
	container: "map",
	// style: "https://tiles.openfreemap.org/styles/positron",
	center: stoneHenge,
	zoom: 15,
	hash: true,
});

const marker = new maplibregl.Marker({ draggable: true })
	.setLngLat(stoneHenge)
	.addTo(map);

map.addControl(
	new SeasonControl((date) => {
		state.date = date;
		updateHenge();
	}, marker),
	"top-left",
);

map.setStyle("https://tiles.openfreemap.org/styles/bright", {
	transformStyle: (previousStyle, nextStyle) => {
		// nextStyle.projection = { type: "globe" };
		// nextStyle.sources = {
		// 	...nextStyle.sources,
		// 	satelliteSource: {
		// 		type: "raster",
		// 		tiles: [
		// 			"https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/{z}/{y}/{x}.jpg",
		// 		],
		// 		tileSize: 256,
		// 	},
		// };

		// const firstNonFillLayer = nextStyle.layers.find(
		// 	(layer) => layer.type !== "!fill" && layer.type !== "background",
		// );
		// nextStyle.layers.splice(nextStyle.layers.indexOf(firstNonFillLayer), 0, {
		// 	id: "satellite",
		// 	type: "raster",
		// 	source: "satelliteSource",
		// 	layout: { visibility: "visible" },
		// 	paint: { "raster-opacity": 1 },
		// });
		return nextStyle;
	},
});

// const sunriseStr = `${times.sunrise.getHours()}:${times.sunrise.getMinutes()}`;

function getBearingLines({
	date = new Date(),
	center = [0, 0],
	elevation = 0.1,
}) {
	const times = SunCalc.getTimes(date, center.lat, center.lng, elevation);

	const sunrisePos = SunCalc.getPosition(times.sunrise, center.lat, center.lng);

	const sunsetPos = SunCalc.getPosition(times.sunset, center.lat, center.lng);

	const sunriseBearing = ((sunrisePos.azimuth * 180) / Math.PI + 180) % 360;

	const sunsetBearing = ((sunsetPos.azimuth * 180) / Math.PI + 180) % 360;

	const origin = turf.point(center.toArray());

	const sunriseHorizonPoint = turf.destination(
		origin,
		state.bearingLength,
		sunriseBearing,
		{
			units: "kilometers",
		},
	);

	const sunsetHorizonPoint = turf.destination(
		origin,
		state.bearingLength,
		sunsetBearing,
		{
			units: "kilometers",
		},
	);

	const sunriseAzimuthLine = turf.greatCircle(
		center.toArray(),
		sunriseHorizonPoint.geometry.coordinates,
		{
			properties: {
				type: "sunrise",
			},
		},
	);

	const sunsetAzimuthLine = turf.greatCircle(
		center.toArray(),
		sunsetHorizonPoint.geometry.coordinates,
		{
			properties: {
				type: "sunset",
			},
		},
	);

	function horizonRadius(elevationMeters) {
		const R = 6371000; // meters
		return Math.sqrt(2 * R * elevationMeters) / 1000; //kim
	}

	const horizonCircle = turf.circle(
		turf.point(center.toArray()),
		horizonRadius(2),
		{
			units: "kilometers",
			steps: 64,
			properties: {
				type: "horizon",
			},
		},
	);

	const azimuthLimitCircle = turf.circle(
		turf.point(center.toArray()),
		state.bearingLength,
		{
			units: "kilometers",
			steps: 64,
			properties: {
				type: "azimuthLimitCircle",
			},
		},
	);

	return turf.featureCollection([
		sunriseAzimuthLine,
		sunsetAzimuthLine,
		horizonCircle,
		azimuthLimitCircle,
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

	marker.on("drag", (e) => {
		// console.log("drag fired");
		state.lngLat = e.target.getLngLat();
		updateHenge();
	});
	updateHenge();
});

function updateHenge() {
	const { date, lngLat, elevation } = state;
	map.getSource("sun-lines").setData(
		getBearingLines({
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
