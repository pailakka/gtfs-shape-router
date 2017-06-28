# gtfs-shape-router
Creates shapes for GTFS package using OSRM
## Installation
Based on ubuntu 16.04 LTS on AWS
Install docker and node:
```
sudo apt-get update
sudo apt-get -y upgrade
curl -sL https://deb.nodesource.com/setup_6.x | sudo -E bash -
sudo apt-get install -y nodejs
```

Clone and install gtfs-shape-router
```
git clone https://github.com/pailakka/gtfs-shape-router.git
cd gtfs-shape-router
npm install
```

Download OSM data and generate OSRM routing graph:
```
wget http://download.geofabrik.de/europe/finland-latest.osm.pbf
node_modules/osrm/lib/binding/osrm-extract -p node_modules/osrm/profiles/car.lua finland-latest.osm.pbf
node_modules/osrm/lib/binding/osrm-contract finland-latest.osrm
```

## Usage
```
node generate_shapes.js <path to OSRM graph> <path to GTFS folder>


For example:
wget http://bussit.kuopio.fi/gtfs/gtfs.zip
unzip 
node generate_shapes.js ../finland-latest.osrm <path to GTFS folder>
mv <path to GTFS folder>/trips_shape.txt <path to GTFS folder>/trips.txt
```
