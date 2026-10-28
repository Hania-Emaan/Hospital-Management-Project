# Hania's Health Hub 🏥

**Hania's Health Hub** is a full-stack, browser-based Hospital Management System (HMS) integrated with a strict, data-grounded AI assistant via the ChatterMate API. It is designed to streamline everyday clinical workflows, manage patient registries, track laboratory diagnostic orders, and automate financial billing statements.

---

## 🚀 Key Features

* **Patient Management & Registry:** Register new patients with auto-incrementing unique IDs (`PID-xxxx`), live directory search, and local persistence.
* **Clinical Consultations & Records:** Record doctor visits, associate primary diagnoses, track medical fees, and store prescribed treatment plans across a multi-doctor roster.
* **Laboratory Diagnostic Workflow:** Order standard diagnostic tests (CBC, Lipid Profile, LFT, Chest X-Ray, etc.), track test status dynamically (*Pending* to *Completed*), and record clinical laboratory findings.
* **Automated Billing & Revenue Metrics:** Generate real-time itemized account statements for individual patients and compute hospital-wide daily financial metrics.
* **Strict Data-Grounded AI Assistant:** Features an embedded AI reporting assistant connected through a custom Node.js proxy server to the ChatterMate API. Constrained by a strict system prompt, the AI delivers real-time summaries of hospital records and diagnostic metrics without data hallucination or unauthorized edits.
* **Supervisor Key Management & Security:** Includes a dynamic Settings interface allowing authorized supervisors to test API endpoints and update live session keys on the fly.

---

## 🛠️ Tech Stack

* **Frontend:** HTML5, CSS3 (Modern Flexbox/Grid UI design system), Vanilla JavaScript (ES6+), LocalStorage API for state persistence.
* **Backend Proxy:** Node.js native `http` module for secure endpoint handling, server-side data extraction, request sizing, same-origin validation, and ChatterMate API request streaming.
* **Integrations & Security:** ChatterMate AI RESTful API, environment variables (`.env`), dynamic supervisor configuration endpoints.

---

## ⚙️ Getting Started & Installation

To run this project locally, follow these steps:

1. **Clone the repository:**
   ```bash
   git clone [https://github.com/Hania-Emaan/Hospital-Management-Project.git](https://github.com/Hania-Emaan/Hospital-Management-Project.git)
   cd Hospital-Management-Project
