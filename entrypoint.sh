#!/bin/sh
echo "Running prisma db push..."
npx prisma db push --skip-generate 2>&1 || echo "prisma db push failed, continuing..."
echo "Starting server..."
exec node server.js
