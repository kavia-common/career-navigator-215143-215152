#!/bin/bash
cd /home/kavia/workspace/code-generation/career-navigator-215143-215152/frontend_cnp_app
npm run build
EXIT_CODE=$?
if [ $EXIT_CODE -ne 0 ]; then
   exit 1
fi

