#!/bin/sh
#
# Build Script
#

npm install
gulp build --modules=modules.json
