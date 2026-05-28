"use strict";

/*
  VOID MAFIA v20 Engine Edition
  Root launcher file

  This file must stay in the MAIN / ROOT folder:
  /index.js

  It starts the real server from:
  /src/index.js
*/

try {
  require("./src/index.js");
} catch (err) {
  console.error("VOID MAFIA failed to start from root index.js");
  console.error(err);

  process.exit(1);
}
