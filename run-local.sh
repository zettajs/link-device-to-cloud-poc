#!/bin/bash

set -e

BASE=3000
if [ "$1" != "" ]; then BASE=$1; fi;

SERVICE_REGISTRY_PORT=$((BASE + 0))

export COREOS_PRIVATE_IPV4=localhost

function start_target() {
    local port=$1
    MAPPED_PORT=$port node target/zetta_target.js > /dev/null &
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
    }

    trap cleanup EXIT
    etcd --force-new-cluster 2> /dev/null &
    ETCD_PID=$(pidof etcd)

    sleep 3;
    etcdctl set /zetta/version '{"version": "0"}'
    etcdctl mkdir /services/zetta
fi

node broker/server.js &

node credential-server/server.js > /dev/null &

start_target $((BASE + 100))
start_target $((BASE + 101))
#start_target $((BASE + 102))

sleep 1;

PORT=$((BASE + 0)) node ../zetta-cloud-proxy/proxy_server.js &
ROUTER_PID=$!

wait;
