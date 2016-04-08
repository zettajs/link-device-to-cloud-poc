#!/bin/bash

set -e

BASE=3000
if [ "$1" != "" ]; then BASE=$1; fi;

SERVICE_REGISTRY_PORT=$((BASE + 0))

TARGET_DIR=${TARGET_DIR:-../zetta-target-server}
ROUTER_DIR=${ROUTER_DIR:-../zetta-cloud-proxy}

export COREOS_PRIVATE_IPV4=localhost

function start_target() {
    local port=$1
    MQTT_BROKER_URL=mqtt://localhost:2883 MAPPED_PORT=$port node $TARGET_DIR/target_server.js &
    echo "Target PID=$!"
    etcdctl set /services/zetta/localhost:$port '{"type":"cloud-target","url":"http://localhost:'$port'","created":"2015-04-23T14:50:42.000Z","version":"0"}'   
}

if [ "$1" == "" ]; then
    echo "Starting ETCD"
    rm -R -f default.etcd
    ETCD_PID=""
    function cleanup {
        echo "Cleanup"
        sleep 2;
        
        kill $ETCD_PID
        rm -R -f default.etcd

        docker rm -f postgres some-rabbit
    }

    trap cleanup EXIT
    etcd --force-new-cluster 2> /dev/null &
    ETCD_PID=$(pidof etcd)

    sleep 3;
    etcdctl set /zetta/version '{"version": "0"}'
    etcdctl mkdir /services/zetta
fi

# start rabbitmq in docker
echo "Starting Rabbitmq in docker"
docker run -d --hostname some-rabbit --name some-rabbit -p 5672:5672 rabbitmq:3-management

# start postgres in docker
echo "Starting Postgres in docker"
docker run -d --name postgres -p 5432:5432 -e POSTGRES_PASSWORD=mysecretpassword postgres
sleep 10

SQL_DIR=$(dirname `pwd`)"/tyrell/roles/database/sql/"
docker run --name create-table --rm -v $SQL_DIR:/sql -e PGPASSWORD="mysecretpassword" postgres sh -c "exec psql -h \"\`/sbin/ip route|awk '/default/ { print $3 }' | cut -d \" \" -f3\`\" -U postgres -1 -f /sql/create_credential_table.sql"

DB_CONNECTION_URL=postgres://postgres:mysecretpassword@localhost:5432/postgres node credential-server/server.js &
BROKER_URL=ampq://localhost:5672 node external-broker/server.js &
BROKER_URL=ampq://localhost:5672 node internal-broker/server.js &

start_target $((BASE + 100))
start_target $((BASE + 101))
#start_target $((BASE + 102))

sleep 1;

PORT=$((BASE + 0)) node $ROUTER_DIR/proxy_server.js &
ROUTER_PID=$!

wait;
