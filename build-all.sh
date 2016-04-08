#!/bin/bash
set -e

DIRS=(external-broker internal-broker credential-server)
for i in ${DIRS[@]}; do
    cd ${i}
    ./build.sh
    cd ..
done

                      

