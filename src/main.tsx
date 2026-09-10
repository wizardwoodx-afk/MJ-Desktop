// Copyright (c) 2024-2026 Sree Harshen / Vouch Harbor. All Rights Reserved.
// See LICENSE file for proprietary software license terms.
// PROHIBITED: copying, redistributing, AI training, or commercial use without written license.

import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./styles/vouch.css";
import "./styles/redesign.css"; // Redesign layer — must load AFTER vouch.css to override structure

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
