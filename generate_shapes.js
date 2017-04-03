var OSRM = require('osrm');
var unzip = require('unzip');
var fs = require('fs');
var path = require('path');
var csv = require('fast-csv');
var simplify = require('turf-simplify');


var osrm = new OSRM(process.argv[2]);
console.log('OSRM graph loaded');


var gtfs_zip_path = process.argv[3];


var stops = {};
var trips = {};
var trip_shapes = {};
var stop_pairs = {};
var shapes = {};


fs.createReadStream(path.join(gtfs_zip_path, "stops.txt"))
    .pipe(csv({
        headers: true
    }))
    .on("data", function (data) {
        data['stop_lat'] = parseFloat(data['stop_lat']);
        data['stop_lon'] = parseFloat(data['stop_lon']);
        stops[data['stop_id']] = data;
    })
    .on("end", function () {
        console.log('stops done');
        handleStopTimes();
    });

var handleStopTimes = function () {
    fs.createReadStream(path.join(gtfs_zip_path, "stop_times.txt"))
        .pipe(csv({
            headers: true
        }))
        .on("data", function (data) {
            if (trips[data['trip_id']] === undefined) {
                trips[data['trip_id']] = [];
            }
            data['stop_sequence'] = parseInt(data['stop_sequence']);
            trips[data['trip_id']].push(data);
        })
        .on("end", function () {
            console.log('stop_times done');
            getRoutesForStopPairs();


        });

}
var created = 0;
var getRoutesForStopPairs = function () {
    Object.keys(trips).forEach(function (trip_id, n) {
        trips[trip_id].sort(function (a, b) {
            return a.stop_sequence - b.stop_sequence;
        });



        var sk = trips[trip_id].map(function (st) {
            return st.stop_id;
        }).join('-');


        trip_shapes[trip_id] = {
            shape_key: sk
        };

        var shape_stop_pairs = false;
        if (shapes[sk] === undefined) {
            shapes[sk] = {
                "id": Object.keys(shapes).length,
                coordinates: [],
            };
            shape_stop_pairs = [];
        }


        var prev_stop = null;
        trips[trip_id].forEach(function (st, idx) {
            if (!prev_stop) {
                prev_stop = st.stop_id;
                return;
            }

            var spk = prev_stop + '-' + st.stop_id;
            trips[trip_id][idx].spk = spk;
            if (shape_stop_pairs !== false) {
                shape_stop_pairs.push(spk);
            }

            if (stop_pairs[spk] === undefined) {
                stop_pairs[spk] = {
                    from: prev_stop,
                    to: st.stop_id,
                    route: null
                };
            }

            prev_stop = st.stop_id;

        });

        if (shape_stop_pairs !== false) {
            shapes[sk].stop_pairs = shape_stop_pairs;
        }



    });


    const numpairs = Object.keys(stop_pairs).length;


    console.log('Resolving routes for', numpairs, 'stop pairs');
    Object.keys(stop_pairs).forEach(function (spk, i) {
        var sp = stop_pairs[spk];

        var from = stops[sp.from];
        var to = stops[sp.to];
        osrm.route({
            coordinates: [
                [from.stop_lon, from.stop_lat],
                [to.stop_lon, to.stop_lat]
            ],
            geometries: 'geojson',
            overview: 'full'
        }, function (err, result) {
            if (err) throw err;
            stop_pairs[spk].route = simplify({
                "type": "Feature",
                "properties": {
                    "spk": spk
                },
                "geometry": result.routes[0].geometry
            }, 0.00001, false);
            created--;
            allStopPairsDone();
        });
        created++;
    });


}

var allStopPairsDone = function () {
    if (created > 0) {
        if (created % 1000 === 0) {
            console.log(new Date(), created);
        }
        return
    }

    console.log('all done');
    var outgeojson = {
        "type": "FeatureCollection",
        "features": []
    };

    Object.keys(stop_pairs).forEach(function (spk, i) {
        outgeojson.features.push(stop_pairs[spk].route);
    });

    //fs.writeFileSync("test.geojson", JSON.stringify(outgeojson, null, 4));


    var shapesCsvStream = csv.createWriteStream({
            headers: true
        }),
        writableStream = fs.createWriteStream(path.join(gtfs_zip_path, "shapes.txt"));


    var debugShapes = {
        "type": "FeatureCollection",
        "features": []
    };


    writableStream.on("finish", function () {
        console.log("writing shapes done");
    });
    shapesCsvStream.pipe(writableStream);
    Object.keys(shapes).forEach(function (sk, i) {
        var seq = 1;
        var debugCoords = [];
        shapes[sk].stop_pairs.forEach(function (spk, i2) {
            stop_pairs[spk].route.geometry.coordinates.forEach(function (c, i) {
                shapes[sk].coordinates.push(c);
                shapesCsvStream.write({
                    shape_id: shapes[sk].id,
                    shape_pt_lat: c[1],
                    shape_pt_lon: c[0],
                    shape_pt_sequence: seq
                });
                debugCoords.push(c);
                seq++;
            });
        });

        debugShapes.features.push({
            "type": "Feature",
            "properties": {
                "sk": sk
            },
            "geometry": {
                coordinates: debugCoords,
                type: "LineString"
            }
        });
    });
    shapesCsvStream.end();


    fs.writeFileSync("shapes.geojson", JSON.stringify(debugShapes, null, 4));

    csv
        .fromPath(path.join(gtfs_zip_path, "trips.txt"), {
            headers: true
        })
        .transform(function (obj) {
            return Object.assign(obj, {
                shape_id: (trip_shapes[obj.trip_id] ? shapes[trip_shapes[obj.trip_id].shape_key].id : null)
            });
        })
        .pipe(csv.createWriteStream({
            headers: true
        }))
        .pipe(fs.createWriteStream(path.join(gtfs_zip_path, "trips_shape.txt"), {
            encoding: "utf8"
        }));

}