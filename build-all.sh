#!/bin/bash
set -e

DIRS=(external-broker internal-broker credential-server target)
for i in ${DIRS[@]}; do
    cd ${i}
    ./build.sh
    cd ..
done

                      

