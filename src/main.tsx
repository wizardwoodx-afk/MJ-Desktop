// Copyright (c) 2024-2026 Sree Harshen / MJ Project. All Rights Reserved.
// See LICENSE file for proprietary software license terms.
// PROHIBITED: copying, redistributing, AI training, or commercial use without written license.

import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./styles/mj.css";
import "./styles/redesign.css"; // 11.9.4 Redesign layer — must load AFTER mj.css to override structure

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
