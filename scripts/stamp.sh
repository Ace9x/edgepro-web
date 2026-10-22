#!/bin/sh
# stamp the service-worker cache with the current commit time
sed -i "s/edgepro-[A-Za-z0-9]*'/edgepro-$(date +%Y%m%d%H%M%S)'/" sw.js
