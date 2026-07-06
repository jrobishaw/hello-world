# AquaBalance

A static web app for pool chemistry, pool equipment planning, maintenance tracking, and weather-based chlorine loss estimation.

## What it does

- Record pool water tests for free chlorine, combined chlorine, total chlorine, pH, total alkalinity, calcium hardness, CYA, and water temperature
- Calculate chemistry recommendations based on your pool profile and equipment
- Store previous readings locally in the browser and display them in charts or tables
- Save a customizable equipment profile for tailored preventative maintenance
- Pull NWS hourly forecast data and estimate chlorine burn
- Accept pasted AWN weather exports for historical weather calibration

## How to run

Open `index.html` in a browser or serve the repo with any static file server.

Example:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.

## Notes

- Data is stored locally in the browser using `localStorage`
- The weather page can use NWS forecast data without any API key
- AWN imports are optional and can be pasted as CSV or JSON
