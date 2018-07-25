#!/bin/sh
#
# Build Script
#

source ~/.nvm/nvm.sh
nvm use
npm install
gulp build --modules=modules.json
