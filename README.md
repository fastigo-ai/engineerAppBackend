# Door2fy Original Backend

This repository contains the core business logic and infrastructure for Door2fy's professional service marketplace.

## 📖 Documentation

We have comprehensive technical documentation available in the `docs/` directory:

-   [**Full Backend Manual**](./docs/FULL_BACKEND_DOCUMENTATION.md): Deep-dive into architecture, infrastructure, and core modules (Auth, Wallet, Dispatch).
-   [**Order & Vendor Processes**](./docs/ORIGINAL_BACKEND_PROCESSES.md): Step-by-step logic flows for B2C and B2B orders.
-   [**Engineer Onboarding API**](./docs/ENGINEER_ONBOARDING_API.md): Guide for engineer verification and activation.

## 🚀 Key Features

-   **Spatial Intelligence**: Ubex H3-based real-time engineer matching.
-   **Financial Engine**: Atomic wallet system with Razorpay Payouts.
-   **Dispatch System**: High-performance radial dispatching for professional services.
-   **B2B Integration**: Specialized leads management for vendor partners.
-   **Notification Engine**: Reliable push notification queue with auto-retries.

## 🛠️ Tech Stack

-   **Runtime**: Node.js
-   **Database**: MongoDB
-   **Real-time**: Socket.io
-   **Payments**: Razorpay
-   **Messages**: FCM

## 🏗️ Getting Started

1.  **Clone the repository**.
2.  **Install dependencies**:
    ```bash
    npm install
    ```
3.  **Setup Environment**: Create a `.env` file based on the required variables listed in the [Full Manual](./docs/FULL_BACKEND_DOCUMENTATION.md).
4.  **Run in Development**:
    ```bash
    npm run dev
    ```

---

*© 2026 Door2fy. All rights reserved.*
