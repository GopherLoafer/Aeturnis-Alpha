#!/bin/bash

mkdir -p server/src/{controllers,services,repositories,middleware,routes,database,types,utils,config,sockets}
touch server/src/index.ts
echo "// Entry point for Aeturnis Online server" > server/src/index.ts

echo "✅ Initial project structure created."