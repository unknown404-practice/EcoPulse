# 🌱 EcoPulse

**Premium Developer Dashboard for Carbon-Aware Workload Orchestration**

EcoPulse is a modern, responsive React dashboard built to monitor real-time grid carbon intensity and automatically scale or halt cloud workloads based on predefined emissions thresholds. It enables developers to make their applications carbon-aware by shifting compute tasks to times when the energy grid is "green".

## ✨ Features

- **Real-Time Telemetry:** Live carbon intensity data (gCO₂/kWh) fetched from national APIs (e.g., UK National Grid) and weather fallbacks.
- **Task Orchestration:** Simulates pausing heavy background workloads when grid intensity exceeds the set threshold.
- **Multi-Region Support:** Monitor grid status across different regions including UK-National, EU-Central, US-East, and Asia-South.
- **Interactive Dashboards:** Visual representation of current grid health, historical forecasts, and integration overviews.
- **Customizable Thresholds:** Users can tweak carbon thresholds and scheduling windows dynamically from the Settings panel.
- **Premium Design:** Features a beautiful, modern UI with dark/light mode toggles, micro-animations, and dynamic theming elements.

## 🛠️ Technology Stack

- **Frontend:** HTML5, Vanilla CSS3 (Custom Variables, Theming), JavaScript (ES6+)
- **Libraries:** React 18 & ReactDOM (via unpkg), Babel Standalone (for in-browser JSX parsing), Lucide Icons
- **Backend/Auth:** Firebase JS SDK (Compat Mode) for Authentication
- **APIs:**
  - [Carbon Intensity API](https://carbonintensity.org.uk/) (UK Data)
  - [Open-Meteo](https://open-meteo.com/) (Fallback weather data for other regions)

## 🚀 Getting Started

Since EcoPulse uses Babel Standalone to compile React on the fly, you can run it directly using any local web server without needing a build step like Webpack or Vite.

### Prerequisites
- Node.js (for `npx serve`) or Python installed on your system.

### Running Locally

1. **Clone the repository:**
   ```bash
   git clone https://github.com/unknown404-practice/EcoPulse.git
   cd EcoPulse
   ```

2. **Start a local web server:**
   Using Node.js:
   ```bash
   npx serve -p 3000
   ```
   *OR* using Python:
   ```bash
   python -m http.server 3000
   ```

3. **View the app:**
   Open your browser and navigate to `http://localhost:3000`.

## 📁 Project Structure

- `index.html` - The core application file containing all the HTML, inline React/JSX components, and CSS styles.
- `app.js` - Contains additional scripts or modular utilities.
- `style.css` - Extended external stylesheets.
- `library.png` - Logo asset for the application.

## 🤝 Contributing
Contributions, issues, and feature requests are welcome! Feel free to check the issues page.

## 📝 License
This project is licensed under the MIT License.