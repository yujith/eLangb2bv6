#!/bin/bash

# eLanguage Dev Server Runner
# Automatically restarts Vite if it crashes

echo "🚀 Starting eLanguage Development Server..."
echo "💡 The server will auto-restart if it crashes."
echo "🛑 Press Ctrl+C to stop."

# Function to start the dev server
start_dev() {
  echo "$(date '+%Y-%m-%d %H:%M:%S') - Starting Vite dev server..."
  npm run dev &
  DEV_PID=$!
  echo "📍 Server PID: $DEV_PID"
}

# Function to kill the dev server
kill_dev() {
  if [ ! -z "$DEV_PID" ]; then
    echo "$(date '+%Y-%m-%d %H:%M:%S') - Stopping dev server (PID: $DEV_PID)..."
    kill $DEV_PID 2>/dev/null
    wait $DEV_PID 2>/dev/null
  fi
}

# Trap to clean up on exit
trap 'kill_dev; exit' INT TERM

# Main loop
while true; do
  start_dev

  # Wait for the process to exit
  wait $DEV_PID 2>/dev/null

  EXIT_CODE=$?
  echo "$(date '+%Y-%m-%d %H:%M:%S') - Dev server exited with code: $EXIT_CODE"

  if [ $EXIT_CODE -eq 0 ]; then
    echo "✅ Dev server exited normally."
    break
  else
    echo "🔄 Dev server crashed. Restarting in 3 seconds..."
    sleep 3
  fi
done
